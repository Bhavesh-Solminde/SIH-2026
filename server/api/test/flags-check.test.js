/**
 * POST /recycler/flags/check — re-score one of this recycler's own handovers
 * on demand, against the prices already snapshotted onto it at handover time.
 *
 * SAFETY: callPredict is mocked before the app is imported, so this suite
 * never reaches https://sihmodel.vercel.app or any other network host.
 *
 * DB: bhaav_test (port 5433). Serial execution. truncateAll in beforeEach.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7 } from "@bhaav/core/ids";

const callPredictMock = vi.fn();

vi.mock("../src/lib/aiml.js", () => ({
  callPredict: (...args) => callPredictMock(...args),
}));

const { createApp } = await import("../src/app.js");
const {
  prisma, truncateAll, makeRecycler, makeCollector, makeCategory, makeLot, makeHandover,
} = await import("./helpers/db.js");
const { hashPassword } = await import("../src/lib/password.js");

afterAll(() => prisma.$disconnect());

async function loginAgent(app, email, password = "secret") {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password });
  return agent;
}

async function scoreableHandover(overrides = {}) {
  const recycler = await makeRecycler();
  const account = await prisma.recyclerAccount.create({
    data: {
      recyclerId: recycler.id,
      email: `r-${uuidv7().slice(0, 6)}@example.com`,
      passwordHash: await hashPassword("secret"),
    },
  });
  const collector = await makeCollector();
  const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id, unit: "KG" });
  const handover = await makeHandover({
    lotId: lot.id,
    recyclerId: recycler.id,
    referencePriceSnapshot: "300.00",
    referencePriceUnit: "KG",
    referencePriceStatus: "MARKET_MEDIAN",
    buyerOfferSnapshot: "380.00",
    buyerOfferUnit: "KG",
    finalUnitPrice: "410.00",
    inspectedCondition: "GOOD",
    ...overrides,
  });
  return { recycler, account, collector, category, lot, handover };
}

describe("POST /recycler/flags/check", () => {
  beforeEach(async () => {
    await truncateAll();
    callPredictMock.mockReset();
  });

  it("400 — handover_id is required", async () => {
    const app = createApp();
    const { account } = await scoreableHandover();
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/recycler/flags/check").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("handover_id_required");
  });

  it("404 — a handover belonging to a different recycler", async () => {
    const app = createApp();
    const { handover } = await scoreableHandover();
    const otherAccount = await prisma.recyclerAccount.create({
      data: {
        recyclerId: (await makeRecycler()).id,
        email: `other-${uuidv7().slice(0, 6)}@example.com`,
        passwordHash: await hashPassword("secret"),
      },
    });
    const agent = await loginAgent(app, otherAccount.email);

    const res = await agent.post("/recycler/flags/check").send({ handover_id: handover.id });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("handover_not_found");
  });

  it("scores a handover whose reference is only MARKET_MEDIAN, not RESOLVED", async () => {
    const app = createApp();
    const { account, handover } = await scoreableHandover();
    const agent = await loginAgent(app, account.email);
    callPredictMock.mockResolvedValue({
      ok: true,
      body: { anomaly: false, score: 0.1, threshold: 0.5, risk_level: "LOW", features: {} },
    });

    const res = await agent.post("/recycler/flags/check").send({ handover_id: handover.id });

    expect(res.status).toBe(200);
    expect(res.body.prices.reference_price).toBe(300);
    expect(res.body.prices.buyer_offer_per_kg).toBe(380);
    expect(res.body.flag).toBeNull();
  });

  it("422 — not scoreable when a snapshot price is missing", async () => {
    const app = createApp();
    const { account, handover } = await scoreableHandover({ referencePriceSnapshot: null, referencePriceStatus: "UNRESOLVED" });
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/recycler/flags/check").send({ handover_id: handover.id });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("handover_not_scoreable");
    expect(callPredictMock).not.toHaveBeenCalled();
  });

  it("422 — not scoreable when a unit is not KG", async () => {
    const app = createApp();
    const { account, handover } = await scoreableHandover({ buyerOfferUnit: "PIECE" });
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/recycler/flags/check").send({ handover_id: handover.id });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("handover_not_scoreable");
  });

  it("writes a flag when the model reports an anomaly, with collector/recycler ids in detail", async () => {
    const app = createApp();
    const { account, handover, collector, recycler } = await scoreableHandover();
    const agent = await loginAgent(app, account.email);
    callPredictMock.mockResolvedValue({
      ok: true,
      body: { anomaly: true, score: 0.9, threshold: 0.5, risk_level: "CRITICAL", features: { x: 1 } },
    });

    const res = await agent.post("/recycler/flags/check").send({ handover_id: handover.id });

    expect(res.status).toBe(200);
    expect(res.body.flag).not.toBeNull();
    expect(res.body.flag.severity).toBe("CRITICAL");

    const flag = await prisma.anomalyFlag.findFirst({
      where: { subjectType: "HANDOVER", subjectId: handover.id, detectorCode: "ML_PRICE_ANOMALY" },
    });
    expect(flag).not.toBeNull();
    expect(flag.detail.collector_id).toBe(collector.id);
    expect(flag.detail.recycler_id).toBe(recycler.id);
  });

  it("does not create a duplicate flag on a second check", async () => {
    const app = createApp();
    const { account, handover } = await scoreableHandover();
    const agent = await loginAgent(app, account.email);
    callPredictMock.mockResolvedValue({
      ok: true,
      body: { anomaly: true, score: 0.9, threshold: 0.5, risk_level: "WARN", features: {} },
    });

    const first = await agent.post("/recycler/flags/check").send({ handover_id: handover.id });
    const second = await agent.post("/recycler/flags/check").send({ handover_id: handover.id });

    expect(first.body.flag.id).toBe(second.body.flag.id);
    const flags = await prisma.anomalyFlag.findMany({
      where: { subjectType: "HANDOVER", subjectId: handover.id, detectorCode: "ML_PRICE_ANOMALY" },
    });
    expect(flags.length).toBe(1);
  });

  it("502 — the model is unavailable", async () => {
    const app = createApp();
    const { account, handover } = await scoreableHandover();
    const agent = await loginAgent(app, account.email);
    callPredictMock.mockResolvedValue({ ok: false, reason: "timeout" });

    const res = await agent.post("/recycler/flags/check").send({ handover_id: handover.id });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("model_unavailable");
  });

  it("401 — requires session", async () => {
    const { handover } = await scoreableHandover();
    const res = await request(createApp()).post("/recycler/flags/check").send({ handover_id: handover.id });
    expect(res.status).toBe(401);
  });
});
