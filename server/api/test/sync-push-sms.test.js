// POST /sync/push — recycler SMS notification on the OFFLINE acceptance path.
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
const { prisma, truncateAll, makeCategory, makeRecycler } = await import("./helpers/db.js");

const app = createApp();
const collectorId = uuidv7();

afterAll(() => prisma.$disconnect());

function collectorRecord() {
  return {
    type: "collector",
    id: collectorId,
    payload: { id: collectorId, preferred_language: "mr", operating_area: "Nalasopara" },
  };
}

function lotRecord({ id = uuidv7(), categoryId, quantity = 12, unit = "KG" } = {}) {
  return {
    type: "lot",
    id,
    payload: {
      id,
      collector_id: collectorId,
      category_id: categoryId,
      unit,
      quantity,
      condition: "GOOD",
      estimated_value: 1200,
      collection_lat: 19.3919,
      collection_lng: 72.8397,
      collection_ts: "2026-09-02T10:14:00+05:30",
      status: "DRAFT",
      device_id: "pixel-demo",
    },
  };
}

function acceptanceRecord({ id = uuidv7(), lotId, recyclerId }) {
  return {
    type: "acceptance",
    id,
    payload: {
      id,
      lot_id: lotId,
      recycler_id: recyclerId,
      accepted_rate: 420,
      accepted_unit: "KG",
      accepted_ts: "2026-09-02T10:15:00+05:30",
    },
  };
}

const push = (records) =>
  request(app).post("/sync/push").send({ device_id: "pixel-demo", records });

describe("POST /sync/push — recycler SMS notification", () => {
  beforeEach(async () => {
    await truncateAll();
    sendSmsMock.mockReset();
    smsEnabledMock.mockReset();
    sendSmsMock.mockResolvedValue({ ok: true, body: {} });
    smsEnabledMock.mockReturnValue(true);
  });

  it("notifies the recycler when an acceptance arrives via /sync/push", async () => {
    const recycler = await makeRecycler({ phone: "9999999999" });
    const category = await makeCategory({ code: "CABLE" });
    const lotId = uuidv7();

    const res = await push([
      collectorRecord(),
      lotRecord({ id: lotId, categoryId: category.id, quantity: 12, unit: "KG" }),
      acceptanceRecord({ lotId, recyclerId: recycler.id }),
    ]);

    expect(res.status).toBe(200);
    expect(res.body.rejected).toEqual([]);

    // Fire-and-forget: give the microtask queue a turn before asserting.
    await new Promise((r) => setImmediate(r));

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [{ numbers, message }] = sendSmsMock.mock.calls[0];
    expect(numbers).toBe("9999999999");
    expect(message).toContain("CABLE");
    expect(message).toContain("12");
  });

  it("does NOT notify again when the same batch is pushed a second time", async () => {
    const recycler = await makeRecycler({ phone: "9999999999" });
    const category = await makeCategory({ code: "CABLE" });
    const lotId = uuidv7();
    const batch = [
      collectorRecord(),
      lotRecord({ id: lotId, categoryId: category.id }),
      acceptanceRecord({ lotId, recyclerId: recycler.id }),
    ];

    const first = await push(batch);
    expect(first.status).toBe(200);
    expect(first.body.rejected).toEqual([]);
    await new Promise((r) => setImmediate(r));
    expect(sendSmsMock).toHaveBeenCalledTimes(1);

    // Same outbox, re-pushed — the idempotent-replay case a flaky device
    // retry produces. writers.acceptance upserts the same row again; the
    // recycler must not be texted a second time for it.
    const second = await push(batch);
    expect(second.status).toBe(200);
    expect(second.body.rejected).toEqual([]);
    await new Promise((r) => setImmediate(r));

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the recycler has no phone", async () => {
    const recycler = await makeRecycler(); // no phone override — phone is null
    const category = await makeCategory({ code: "CABLE" });
    const lotId = uuidv7();

    const res = await push([
      collectorRecord(),
      lotRecord({ id: lotId, categoryId: category.id }),
      acceptanceRecord({ lotId, recyclerId: recycler.id }),
    ]);

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("still succeeds (fail-open) when the SMS send rejects", async () => {
    sendSmsMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const recycler = await makeRecycler({ phone: "9999999999" });
    const category = await makeCategory({ code: "CABLE" });
    const lotId = uuidv7();

    const res = await push([
      collectorRecord(),
      lotRecord({ id: lotId, categoryId: category.id }),
      acceptanceRecord({ lotId, recyclerId: recycler.id }),
    ]);

    expect(res.status).toBe(200);
    expect(res.body.rejected).toEqual([]);

    const acceptance = await prisma.acceptance.findFirst({ where: { lotId } });
    expect(acceptance).not.toBeNull();

    // Let the rejected promise's .catch() run so it can't surface as an
    // unhandled rejection later in the suite.
    await new Promise((r) => setImmediate(r));
  });
});
