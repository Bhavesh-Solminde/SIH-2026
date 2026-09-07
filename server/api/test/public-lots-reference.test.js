/**
 * The reference code is the collector's whole side of the physical handover:
 * it is what the recycler scans off their screen at the gate, and it is
 * derived from the lot id, so it is valid the moment the lot exists.
 *
 * It used to be read off the handover row — which does not exist until the
 * recycler has inspected the lot, which they cannot do until they have
 * scanned this code. So GET /public/lots returned null for it on every lot a
 * collector could actually be carrying, and the app had no QR to show for
 * the entire window in which the QR is needed.
 *
 * SAFETY: the sms module is mocked here for the same reason it is in
 * public-lots-sms.test.js — POST /public/lots notifies the recycler, and the
 * seeded recyclers carry real phone numbers from the MPCB register. Mocking
 * the module means no test in this file is capable of reaching fast2sms.com.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";

const sendSmsMock = vi.fn();
const smsEnabledMock = vi.fn();

vi.mock("../src/lib/sms.js", () => ({
  sendSms: (...args) => sendSmsMock(...args),
  smsEnabled: (...args) => smsEnabledMock(...args),
}));

const { createApp } = await import("../src/app.js");
const { prisma, truncateAll, makeRecycler, makeCategory } = await import("./helpers/db.js");

afterAll(() => prisma.$disconnect());

function lotBody({ recyclerId, collectorId, deviceId, categoryCode = "CABLE" }) {
  return {
    collectorId,
    categoryCode,
    unit: "KG",
    quantity: 12,
    condition: "GOOD",
    recyclerId,
    acceptedRate: 100,
    deviceId,
    estimatedValue: 1200,
  };
}

describe("reference codes on public lots", () => {
  beforeEach(async () => {
    await truncateAll();
    sendSmsMock.mockReset().mockResolvedValue({ ok: true, body: {} });
    // SMS off: this file is about reference codes, and the notification path
    // has its own suite.
    smsEnabledMock.mockReset().mockReturnValue(false);
  });

  it("returns the reference code when the lot is created, before any handover exists", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    await makeCategory({ code: "CABLE" });
    const deviceId = `dev-${uuidv7().slice(0, 8)}`;

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({ recyclerId: recycler.id, collectorId: uuidv7(), deviceId }));

    expect(res.status).toBe(201);
    expect(res.body.lotId).toBeTruthy();
    expect(res.body.referenceCode).toBe(referenceCodeFromUuid(res.body.lotId));
    // 8 chars of Crockford Base32 — what the collector reads aloud when the
    // scan fails.
    expect(res.body.referenceCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("lists a reference code for a lot that has never been inspected", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    await makeCategory({ code: "CABLE" });
    const deviceId = `dev-${uuidv7().slice(0, 8)}`;

    const created = await request(app)
      .post("/public/lots")
      .send(lotBody({ recyclerId: recycler.id, collectorId: uuidv7(), deviceId }));

    const res = await request(app).get(`/public/lots?device_id=${encodeURIComponent(deviceId)}`);

    expect(res.status).toBe(200);
    expect(res.body.lots).toHaveLength(1);
    const [lot] = res.body.lots;
    expect(lot.status).toBe("PENDING");
    expect(lot.referenceCode).toBe(referenceCodeFromUuid(created.body.lotId));
  });

  it("resolves that same code back to the lot through GET /lots/:reference_code", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    await makeCategory({ code: "CABLE" });
    const deviceId = `dev-${uuidv7().slice(0, 8)}`;

    const created = await request(app)
      .post("/public/lots")
      .send(lotBody({ recyclerId: recycler.id, collectorId: uuidv7(), deviceId }));

    // The round trip the recycler's scanner actually performs.
    const res = await request(app).get(`/lots/${created.body.referenceCode}`);

    expect(res.status).toBe(200);
    expect(res.body.lot.id).toBe(created.body.lotId);
    expect(res.body.handover_status).toBeNull();
  });
});
