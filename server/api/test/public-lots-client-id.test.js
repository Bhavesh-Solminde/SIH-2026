/**
 * POST /public/lots accepting a client-supplied lotId — the fix behind the
 * collector app's offline-accept retry queue (client/app/src/lib/lotOutbox.js,
 * AcceptScreen.jsx).
 *
 * Why this exists: AcceptScreen generates a lotId and its QR reference code
 * BEFORE this request ever fires, because it must show something even if the
 * network call fails and the lot has to be queued for a later retry. Before
 * this change, the server always minted its own lotId regardless of what the
 * client sent — so a delayed retry created a real lot, but under a DIFFERENT
 * id than the QR code already shown to the collector, making that QR
 * permanently wrong. This tests that the server now honours the client id,
 * and that a retried request for a lot that already got created (response
 * lost in transit) is a safe no-op rather than a duplicate-key error.
 *
 * SAFETY: sms module mocked, same reason as public-lots-sms.test.js.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";

vi.mock("../src/lib/sms.js", () => ({
  sendSms: vi.fn().mockResolvedValue({ ok: true, body: {} }),
  smsEnabled: () => false,
}));

const { createApp } = await import("../src/app.js");
const { prisma, truncateAll, makeRecycler, makeCategory } = await import("./helpers/db.js");

afterAll(() => prisma.$disconnect());

function lotBody({ recyclerId, deviceId, lotId, categoryCode = "CABLE" }) {
  return {
    collectorId: uuidv7(),
    categoryCode,
    unit: "KG",
    quantity: 12,
    condition: "GOOD",
    recyclerId,
    acceptedRate: 100,
    deviceId,
    estimatedValue: 1200,
    ...(lotId ? { lotId } : {}),
  };
}

describe("POST /public/lots — client-supplied lotId", () => {
  beforeEach(() => truncateAll());

  it("creates the lot under the client-supplied id, not a server-generated one", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    await makeCategory({ code: "CABLE" });
    const clientLotId = uuidv7();
    const deviceId = `dev-${uuidv7().slice(0, 8)}`;

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({ recyclerId: recycler.id, deviceId, lotId: clientLotId }));

    expect(res.status).toBe(201);
    expect(res.body.lotId).toBe(clientLotId);
    expect(res.body.referenceCode).toBe(referenceCodeFromUuid(clientLotId));

    const row = await prisma.lot.findUnique({ where: { id: clientLotId } });
    expect(row).not.toBeNull();
  });

  it("still generates a server-side id when none is supplied (unchanged for other callers)", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    await makeCategory({ code: "CABLE" });

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({ recyclerId: recycler.id, deviceId: `dev-${uuidv7().slice(0, 8)}` }));

    expect(res.status).toBe(201);
    expect(res.body.lotId).toBeTruthy();
  });

  it("400 — a malformed lotId is rejected rather than silently ignored", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    await makeCategory({ code: "CABLE" });

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({ recyclerId: recycler.id, deviceId: "dev-x", lotId: "not-a-uuid" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_lot_id");
  });

  it("replaying the SAME lotId after a successful create is a safe no-op, not a 500", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    await makeCategory({ code: "CABLE" });
    const clientLotId = uuidv7();
    const deviceId = `dev-${uuidv7().slice(0, 8)}`;
    const body = lotBody({ recyclerId: recycler.id, deviceId, lotId: clientLotId });

    const first = await request(app).post("/public/lots").send(body);
    expect(first.status).toBe(201);

    // Simulates the exact failure mode this exists for: the first request's
    // response never reached the client (app crashed, connection dropped
    // after the server committed), so the outbox retries the identical body.
    const second = await request(app).post("/public/lots").send(body);
    expect(second.status).toBe(200);
    expect(second.body.lotId).toBe(clientLotId);

    const count = await prisma.lot.count({ where: { id: clientLotId } });
    expect(count).toBe(1);
    const acceptanceCount = await prisma.acceptance.count({ where: { lotId: clientLotId } });
    expect(acceptanceCount).toBe(1); // not duplicated either
  });

  it("the replay path does not require recyclerId/category to still resolve — it never re-validates", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    await makeCategory({ code: "CABLE" });
    const clientLotId = uuidv7();
    const deviceId = `dev-${uuidv7().slice(0, 8)}`;
    const body = lotBody({ recyclerId: recycler.id, deviceId, lotId: clientLotId });

    await request(app).post("/public/lots").send(body);

    // Retry with a nonsense recyclerId in the resent body — should still
    // short-circuit to the existing-lot replay before that lookup matters.
    const replay = await request(app)
      .post("/public/lots")
      .send({ ...body, recyclerId: uuidv7() });
    expect(replay.status).toBe(200);
    expect(replay.body.lotId).toBe(clientLotId);
  });
});
