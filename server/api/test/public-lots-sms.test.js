// POST /public/lots — recycler SMS notification.
//
// SAFETY: server/api seeds 161 real recycler businesses from the MPCB public
// register, 155 with real phone numbers. This suite mocks the sms module
// itself (vi.mock below) rather than relying on SMS_ENABLED defaulting to
// false, so no test here is CAPABLE of reaching fast2sms.com regardless of
// env — the real sendSms/smsEnabled implementations never run in this file.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7 } from "@bhaav/core/ids";

const sendSmsMock = vi.fn();
const smsEnabledMock = vi.fn();

vi.mock("../src/lib/sms.js", () => ({
  sendSms: (...args) => sendSmsMock(...args),
  smsEnabled: (...args) => smsEnabledMock(...args),
}));

const { createApp } = await import("../src/app.js");
const { prisma, truncateAll, makeRecycler, makeCategory } = await import("./helpers/db.js");

afterAll(() => prisma.$disconnect());

function lotBody({ recyclerId, categoryCode = "CABLE", collectorId, deviceId }) {
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

describe("POST /public/lots — recycler SMS notification", () => {
  beforeEach(async () => {
    await truncateAll();
    sendSmsMock.mockReset();
    smsEnabledMock.mockReset();
    sendSmsMock.mockResolvedValue({ ok: true, body: {} });
    smsEnabledMock.mockReturnValue(true);
  });

  it("sends an SMS to the recycler's phone when a lot with an acceptance is created and SMS is enabled", async () => {
    const app = createApp();
    const recycler = await makeRecycler({ phone: "9999999999" });
    const category = await makeCategory({ code: "CABLE" });

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({
        recyclerId: recycler.id,
        categoryCode: category.code,
        collectorId: uuidv7(),
        deviceId: "device-1",
      }));

    expect(res.status).toBe(201);

    // The send is fire-and-forget (void, not awaited by the route), so give
    // the microtask queue a turn before asserting it happened.
    await new Promise((r) => setImmediate(r));

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [{ numbers, message }] = sendSmsMock.mock.calls[0];
    expect(numbers).toBe("9999999999");
    expect(message).toContain("CABLE");
    expect(message).toContain("12");
  });

  it("still returns 201 and persists the lot when the SMS send rejects", async () => {
    sendSmsMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const app = createApp();
    const recycler = await makeRecycler({ phone: "9999999999" });
    const category = await makeCategory({ code: "CABLE" });

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({
        recyclerId: recycler.id,
        categoryCode: category.code,
        collectorId: uuidv7(),
        deviceId: "device-2",
      }));

    expect(res.status).toBe(201);
    expect(res.body.lotId).toBeTruthy();
    expect(res.body.deviceId).toBe("device-2");

    const lot = await prisma.lot.findUnique({ where: { id: res.body.lotId } });
    expect(lot).not.toBeNull();
    const acceptance = await prisma.acceptance.findFirst({ where: { lotId: res.body.lotId } });
    expect(acceptance).not.toBeNull();

    // Let the rejected promise's .catch() run so it can't surface as an
    // unhandled rejection later in the suite.
    await new Promise((r) => setImmediate(r));
  });

  it("sends nothing when the recycler has no phone number", async () => {
    const app = createApp();
    const recycler = await makeRecycler(); // no phone override — phone is null
    const category = await makeCategory({ code: "CABLE" });

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({
        recyclerId: recycler.id,
        categoryCode: category.code,
        collectorId: uuidv7(),
        deviceId: "device-3",
      }));

    expect(res.status).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("sends nothing when SMS_ENABLED is not \"true\"", async () => {
    smsEnabledMock.mockReturnValue(false);
    const app = createApp();
    const recycler = await makeRecycler({ phone: "9999999999" });
    const category = await makeCategory({ code: "CABLE" });

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({
        recyclerId: recycler.id,
        categoryCode: category.code,
        collectorId: uuidv7(),
        deviceId: "device-4",
      }));

    expect(res.status).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("contains no collector or device identifier in the sent text", async () => {
    const app = createApp();
    const recycler = await makeRecycler({ phone: "9999999999" });
    const category = await makeCategory({ code: "CABLE" });
    const collectorId = uuidv7();
    const deviceId = "device-secret-5";

    const res = await request(app)
      .post("/public/lots")
      .send(lotBody({
        recyclerId: recycler.id,
        categoryCode: category.code,
        collectorId,
        deviceId,
      }));

    expect(res.status).toBe(201);
    await new Promise((r) => setImmediate(r));

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [{ message }] = sendSmsMock.mock.calls[0];
    expect(message).not.toContain(collectorId);
    expect(message).not.toContain(deviceId);
    expect(message).not.toContain(res.body.lotId);
  });
});
