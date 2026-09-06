import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";

// Mocked before the app is imported so the route binds the mock, not the real
// module. The point of this suite is the WIRING — that confirm calls detection
// and survives detection failing — not what the detectors compute.
vi.mock("../src/lib/detectRun.js", () => ({
  runDetection: vi.fn(),
}));

const { runDetection } = await import("../src/lib/detectRun.js");
const { createApp } = await import("../src/app.js");
const {
  prisma, truncateAll, makeRecycler, makeCollector, makeCategory, makeLot, makeHandover,
} = await import("./helpers/db.js");

const app = createApp();

beforeEach(async () => {
  await truncateAll();
  vi.clearAllMocks();
});

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

// A handover sitting in PENDING_COLLECTOR, ready to be counter-signed.
// makeHandover already defaults to that status and derives referenceCode from
// the lot id, so only the recycler's own signature needs setting here.
async function pendingHandover() {
  const recycler = await makeRecycler({ authorizationStatus: "VALID" });
  const collector = await makeCollector();
  const category = await makeCategory({ code: "CABLE" });
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id });
  const handover = await makeHandover({
    lotId: lot.id,
    recyclerId: recycler.id,
    recyclerConfirmedAt: new Date(),
  });
  return { lot, handover };
}

describe("POST /handover/:lot_id/confirm", () => {
  it("triggers a detection run once the handover is confirmed", async () => {
    runDetection.mockResolvedValue({ runId: "r1", status: "ok", flagsWritten: 0 });
    const { lot } = await pendingHandover();

    const res = await request(app).post(`/handover/${lot.id}/confirm`).send({});

    expect(res.status).toBe(200);
    // Fired without await, so let the microtask queue drain before asserting.
    await new Promise((r) => setImmediate(r));
    expect(runDetection).toHaveBeenCalledTimes(1);
  });

  it("still confirms the handover when the detector service is down", async () => {
    // The whole fail-open contract: a detector outage must never cost a
    // collector their counter-signature.
    runDetection.mockRejectedValue(new Error("aiml unreachable"));
    const { lot } = await pendingHandover();

    const res = await request(app).post(`/handover/${lot.id}/confirm`).send({});

    expect(res.status).toBe(200);
    expect(res.body.handover_id).toBeDefined();
    await new Promise((r) => setImmediate(r));
    const row = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(row.status).toBe("CONFIRMED");
  });

  it("does not trigger detection when the handover was already confirmed", async () => {
    runDetection.mockResolvedValue({ runId: "r1", status: "ok", flagsWritten: 0 });
    const { lot } = await pendingHandover();
    await request(app).post(`/handover/${lot.id}/confirm`).send({});
    await new Promise((r) => setImmediate(r));
    vi.clearAllMocks();

    const res = await request(app).post(`/handover/${lot.id}/confirm`).send({});

    expect(res.status).toBe(404);
    await new Promise((r) => setImmediate(r));
    expect(runDetection).not.toHaveBeenCalled();
  });
});
