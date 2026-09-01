import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeCategory, makeRecycler } from "./helpers/db.js";

const app = createApp();
let cat;
let rec;
const collectorId = uuidv7();

beforeEach(async () => {
  await truncateAll();
  cat = await makeCategory();
  rec = await makeRecycler();
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

function lotRecord(over = {}) {
  const id = over.id ?? uuidv7();
  return {
    type: "lot",
    id,
    payload: {
      id,
      collector_id: collectorId,
      category_id: cat.id,
      unit: "KG",
      quantity: 3,
      condition: "GOOD",
      estimated_value: 1260,
      collection_lat: 19.3919,
      collection_lng: 72.8397,
      collection_ts: "2026-09-02T10:14:00+05:30",
      status: "DRAFT",
      device_id: "pixel-demo",
      ...over.payload,
    },
  };
}

function collectorRecord() {
  return {
    type: "collector",
    id: collectorId,
    payload: { id: collectorId, preferred_language: "mr", operating_area: "Nalasopara" },
  };
}

const push = (records) =>
  request(app).post("/sync/push").send({ device_id: "pixel-demo", records });

describe("POST /sync/push", () => {
  it("applies a collector and a lot in one batch", async () => {
    const lot = lotRecord();
    const res = await push([collectorRecord(), lot]);
    expect(res.status).toBe(200);
    expect(res.body.applied).toEqual([collectorId, lot.id]);
    expect(res.body.rejected).toEqual([]);
    expect(await prisma.lot.count()).toBe(1);
  });

  it("is idempotent — replaying the identical batch changes nothing", async () => {
    const batch = [collectorRecord(), lotRecord()];
    await push(batch);
    const res = await push(batch);
    expect(res.status).toBe(200);
    expect(res.body.rejected).toEqual([]);
    expect(await prisma.lot.count()).toBe(1);
  });

  it("never rewrites a lot the device already sent", async () => {
    const lot = lotRecord();
    await push([collectorRecord(), lot]);
    await push([{ ...lot, payload: { ...lot.payload, quantity: 999, estimated_value: 1 } }]);
    const stored = await prisma.lot.findUnique({ where: { id: lot.id } });
    expect(Number(stored.quantity)).toBe(3);
    expect(Number(stored.estimatedValue)).toBe(1260);
  });

  it("accepts an acceptance whose lot arrives in the same batch", async () => {
    const lot = lotRecord();
    const acceptanceId = uuidv7();
    const res = await push([
      collectorRecord(),
      lot,
      {
        type: "acceptance",
        id: acceptanceId,
        payload: {
          id: acceptanceId,
          lot_id: lot.payload.id,
          recycler_id: rec.id,
          accepted_rate: 420,
          accepted_unit: "KG",
          accepted_ts: "2026-09-02T10:15:00+05:30",
        },
      },
    ]);
    expect(res.body.rejected).toEqual([]);
    expect(await prisma.acceptance.count()).toBe(1);
  });

  it("rejects an acceptance whose lot is unknown and not in the batch", async () => {
    const acceptanceId = uuidv7();
    const res = await push([
      {
        type: "acceptance",
        id: acceptanceId,
        payload: {
          id: acceptanceId,
          lot_id: uuidv7(),
          recycler_id: rec.id,
          accepted_rate: 420,
          accepted_unit: "KG",
          accepted_ts: "2026-09-02T10:15:00+05:30",
        },
      },
    ]);
    expect(res.body.applied).toEqual([]);
    expect(res.body.rejected).toHaveLength(1);
    expect(res.body.rejected[0].reason).toMatch(/unknown lot/);
  });

  it("rejects an unknown type and still returns 200", async () => {
    const badId = uuidv7();
    const res = await push([
      { type: "WOMBAT", id: badId, payload: { id: badId } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.rejected[0].id).toBe(badId);
    expect(res.body.rejected[0].reason).toMatch(/unknown record type/);
  });

  it("rejects an invalid record with a readable reason and applies the rest", async () => {
    const good = lotRecord();
    const bad = lotRecord({ payload: { condition: "MAYBE" } });
    const res = await push([collectorRecord(), good, bad]);
    expect(res.body.applied).toContain(good.payload.id);
    expect(res.body.applied).not.toContain(bad.payload.id);
    expect(res.body.rejected[0].reason).toMatch(/condition/);
  });

  it("never mutates an existing handover", async () => {
    const lot = lotRecord();
    const handoverId = uuidv7();
    const handover = {
      type: "handover",
      id: handoverId,
      payload: {
        id: handoverId,
        lot_id: lot.payload.id,
        recycler_id: rec.id,
        reference_code: referenceCodeFromUuid(lot.payload.id),
        inspected_quantity: 2.9,
        final_unit_price: 390,
        final_total: 1131,
        handover_ts: "2026-09-02T12:40:00+05:30",
        status: "PENDING_COLLECTOR",
      },
    };
    await push([collectorRecord(), lot, handover]);
    await push([{ ...handover, payload: { ...handover.payload, final_total: 99 } }]);
    const stored = await prisma.handover.findUnique({ where: { id: handoverId } });
    expect(Number(stored.finalTotal)).toBe(1131);
  });

  it("rejects a batch that is not an array of records", async () => {
    const res = await request(app).post("/sync/push").send({ device_id: "d", records: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("applies a 200-record batch without partial failure", async () => {
    const records = [collectorRecord()];
    for (let i = 0; i < 200; i += 1) records.push(lotRecord());
    const res = await push(records);
    expect(res.body.rejected).toEqual([]);
    expect(await prisma.lot.count()).toBe(200);
  });
});
