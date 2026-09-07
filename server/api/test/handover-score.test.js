// POST /handover — the fire-and-forget ML price-scoring call.
//
// SAFETY: callPredict is mocked below before the app is imported, so this
// suite never reaches https://sihmodel.vercel.app or any other network host.
//
// This is Part 1 of the 2026-09-06 repair plan: reference_price must be a
// MARKET reference (the median RECYCLER_PUBLISHED rate among other VALID
// recyclers for the lot's category), not this same recycler's own accepted
// rate — sending the same value for both collapsed buyer_reference_ratio to a
// constant 1.0 and negotiation_gap_pct into abs_price_deviation_pct.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7 } from "@bhaav/core/ids";

const callPredictMock = vi.fn(async () => ({ ok: false, reason: "mocked" }));

vi.mock("../src/lib/aiml.js", () => ({
  callPredict: (...args) => callPredictMock(...args),
  callDetect: vi.fn(async () => ({ ok: false, reason: "mocked" })),
}));

const { createApp } = await import("../src/app.js");
const {
  prisma, truncateAll, makeRecycler, makeCollector, makeCategory, makeLot,
} = await import("./helpers/db.js");
const { hashPassword } = await import("../src/lib/password.js");

afterAll(() => prisma.$disconnect());

async function loginAgent(app, email, password = "secret") {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password });
  return agent;
}

async function acknowledgedLot({ buyer, category, acceptedRate = "380.00" }) {
  const collector = await makeCollector();
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id });
  await prisma.acceptance.create({
    data: {
      id: uuidv7(),
      lotId: lot.id,
      recyclerId: buyer.id,
      acceptedRate,
      acceptedUnit: "KG",
      acceptedTs: new Date(),
      recyclerResponse: "ACKNOWLEDGED",
    },
  });
  return lot;
}

// scoreHandover is fire-and-forget: the response returns before callPredict
// resolves, and (after this fix) there is a real DB round trip in between —
// so poll for the mock call rather than assuming one microtask tick.
async function waitForPredict() {
  await vi.waitFor(() => expect(callPredictMock).toHaveBeenCalledTimes(1), {
    timeout: 2000,
    interval: 20,
  });
}

describe("POST /handover — market reference fed to the price model", () => {
  beforeEach(async () => {
    await truncateAll();
    callPredictMock.mockClear();
  });

  it("sends a reference_price distinct from buyer_offer_per_kg when a market reference exists", async () => {
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });

    // The buyer: this recycler's own accepted rate is 380/kg.
    const buyer = await makeRecycler();
    const buyerAccount = await prisma.recyclerAccount.create({
      data: {
        recyclerId: buyer.id,
        email: `buyer-${uuidv7().slice(0, 6)}@example.com`,
        passwordHash: await hashPassword("secret"),
      },
    });

    // A different VALID recycler publishing its own rate for the same
    // category — this is the market reference.
    const other = await makeRecycler();
    await prisma.rate.create({
      data: {
        recyclerId: other.id,
        categoryId: category.id,
        unit: "KG",
        price: "300.00",
        source: "RECYCLER_PUBLISHED",
      },
    });

    const lot = await acknowledgedLot({ buyer, category });

    const app = createApp();
    const agent = await loginAgent(app, buyerAccount.email);
    const res = await agent.post("/handover").send({ lot_id: lot.id, inspected_condition: "GOOD" });
    expect(res.status).toBe(200);

    await waitForPredict();

    const payload = callPredictMock.mock.calls[0][0];
    expect(payload.buyer_offer_per_kg).toBe(380);
    expect(payload.reference_price).toBe(300);
    expect(payload.reference_price).not.toBe(payload.buyer_offer_per_kg);
  });

  it("falls back to the buyer's own rate when no market reference exists", async () => {
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });
    const buyer = await makeRecycler();
    const buyerAccount = await prisma.recyclerAccount.create({
      data: {
        recyclerId: buyer.id,
        email: `only-${uuidv7().slice(0, 6)}@example.com`,
        passwordHash: await hashPassword("secret"),
      },
    });

    const lot = await acknowledgedLot({ buyer, category });

    const app = createApp();
    const agent = await loginAgent(app, buyerAccount.email);
    const res = await agent.post("/handover").send({ lot_id: lot.id, inspected_condition: "GOOD" });
    expect(res.status).toBe(200);

    await waitForPredict();

    const payload = callPredictMock.mock.calls[0][0];
    expect(payload.reference_price).toBe(380);
    expect(payload.reference_price).toBe(payload.buyer_offer_per_kg);
  });
});
