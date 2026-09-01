import { uuidv7 } from "@bhaav/core/ids";
import { enqueue, pending, markSynced, bumpAttempt, pendingCount } from "../../src/db/repos/outbox.js";
import { createLot, listLots, setLotStatus, earningsTotals } from "../../src/db/repos/lots.js";
import { createAcceptance } from "../../src/db/repos/acceptances.js";
import { createHandover, confirmHandover } from "../../src/db/repos/handovers.js";
import { makePrismaClient } from "../helpers/prismaTestClient.js";

let db;
const collectorId = uuidv7();

beforeEach(async () => {
  db = await makePrismaClient();
  await db.collector.create({
    data: { id: collectorId, preferredLanguage: "mr", createdAt: new Date().toISOString() },
  });
});
afterEach(async () => {
  await db.$disconnect();
});

const draft = (over = {}) => ({
  collectorId,
  categoryId: "cat-1",
  categoryCode: "PCB",
  unit: "KG",
  quantity: 3,
  condition: "GOOD",
  sourceType: "HOUSEHOLD",
  estimatedValue: 1260,
  collectionLat: 19.3919,
  collectionLng: 72.8397,
  collectionTs: "2026-09-02T10:14:00+05:30",
  deviceId: "pixel-demo",
  ...over,
});

describe("createLot", () => {
  it("writes the lot and one outbox row in the same call", async () => {
    const lot = await createLot(db, draft());
    expect(lot.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await pendingCount(db)).toBe(1);
  });

  it("gives the lot a device-generated uuid before anything touches a network", async () => {
    const a = await createLot(db, draft());
    const b = await createLot(db, draft());
    expect(a.id).not.toBe(b.id);
  });

  it("stores the lot at DRAFT", async () => {
    const lot = await createLot(db, draft());
    expect(lot.status).toBe("DRAFT");
  });

  it("puts the full server payload in the outbox row, not a reference to it", async () => {
    await createLot(db, draft());
    const [row] = await pending(db);
    const payload = JSON.parse(row.payload);
    expect(payload.category_id).toBe("cat-1");
    expect(payload.quantity).toBe(3);
    expect(payload.condition).toBe("GOOD");
    expect(payload.collection_ts).toBe("2026-09-02T10:14:00+05:30");
  });

  it("lists lots newest first", async () => {
    const first = await createLot(db, draft());
    await new Promise((r) => setTimeout(r, 3));
    const second = await createLot(db, draft());
    const rows = await listLots(db, 10);
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });
});

describe("createAcceptance", () => {
  it("writes the acceptance, flips the lot to ACCEPTED and enqueues both", async () => {
    const lot = await createLot(db, draft());
    await createAcceptance(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      rate: 420,
      unit: "KG",
    });
    const rows = await pending(db);
    expect(rows.map((r) => r.entityType)).toEqual(["lot", "acceptance"]);
    const stored = (await listLots(db, 1))[0];
    expect(stored.status).toBe("ACCEPTED");
  });

  it("freezes the accepted rate rather than storing a pointer to the rate table", async () => {
    const lot = await createLot(db, draft());
    await createAcceptance(db, { lotId: lot.id, recyclerId: "rec-1", rate: 420, unit: "KG" });
    await db.$executeRawUnsafe("UPDATE rate SET price = 1");
    const acc = await db.acceptance.findFirst();
    expect(acc.acceptedRate).toBe(420);
  });
});

describe("confirmHandover", () => {
  it("records the collector signature and enqueues the confirmation", async () => {
    const lot = await createLot(db, draft());
    await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 2.9,
      finalUnitPrice: 390,
      finalTotal: 1131,
      handoverTs: "2026-09-02T12:40:00+05:30",
      recyclerConfirmedAt: "2026-09-02T12:40:00+05:30",
    });
    const h = await confirmHandover(db, { lotId: lot.id, agree: true });
    expect(h.status).toBe("CONFIRMED");
    expect(h.collectorConfirmedAt).not.toBeNull();
    const types = (await pending(db)).map((r) => r.entityType);
    expect(types).toContain("handover_confirm");
  });

  it("marks DISPUTED when the collector says the amount is wrong", async () => {
    const lot = await createLot(db, draft());
    await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 2.9,
      finalUnitPrice: 390,
      finalTotal: 1131,
      handoverTs: "2026-09-02T12:40:00+05:30",
      recyclerConfirmedAt: "2026-09-02T12:40:00+05:30",
    });
    const h = await confirmHandover(db, { lotId: lot.id, agree: false });
    expect(h.status).toBe("DISPUTED");
  });

  it("derives the reference code from the lot uuid so the QR matches the server", async () => {
    const { referenceCodeFromUuid } = await import("@bhaav/core/ids");
    const lot = await createLot(db, draft());
    const h = await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 2.9,
      finalUnitPrice: 390,
      finalTotal: 1131,
      handoverTs: "2026-09-02T12:40:00+05:30",
    });
    expect(h.referenceCode).toBe(referenceCodeFromUuid(lot.id));
  });
});

describe("outbox", () => {
  it("returns only unsynced rows, oldest first", async () => {
    const a = await createLot(db, draft());
    const b = await createLot(db, draft());
    const rows = await pending(db);
    expect(rows).toHaveLength(2);
    await markSynced(db, [rows[0].id]);
    const left = await pending(db);
    expect(left).toHaveLength(1);
    expect(left[0].entityId).toBe(b.id);
    expect(a.id).toBeDefined();
  });

  it("counts pending rows for the header pill", async () => {
    await createLot(db, draft());
    await createLot(db, draft());
    expect(await pendingCount(db)).toBe(2);
  });

  it("increments attempts and records the reason on a rejection", async () => {
    await createLot(db, draft());
    const [row] = await pending(db);
    await bumpAttempt(db, row.id, "unknown lot");
    const [again] = await pending(db);
    expect(again.attempts).toBe(1);
    expect(again.lastError).toBe("unknown lot");
  });

  it("keeps a rejected row pending so it is retried", async () => {
    await createLot(db, draft());
    const [row] = await pending(db);
    await bumpAttempt(db, row.id, "network");
    expect(await pendingCount(db)).toBe(1);
  });
});

describe("earningsTotals", () => {
  it("sums confirmed handovers for this week and this month", async () => {
    const lot = await createLot(db, draft());
    await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 3,
      finalUnitPrice: 400,
      finalTotal: 1200,
      handoverTs: new Date().toISOString(),
      recyclerConfirmedAt: new Date().toISOString(),
    });
    await confirmHandover(db, { lotId: lot.id, agree: true });
    const t = await earningsTotals(db);
    expect(t.month).toBe(1200);
    expect(t.week).toBe(1200);
  });

  it("excludes an unconfirmed handover — it is not money yet", async () => {
    const lot = await createLot(db, draft());
    await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 3,
      finalUnitPrice: 400,
      finalTotal: 1200,
      handoverTs: new Date().toISOString(),
    });
    expect((await earningsTotals(db)).month).toBe(0);
  });
});
