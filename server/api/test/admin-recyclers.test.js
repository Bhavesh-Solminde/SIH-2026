import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeRecycler, makeCategory, makeCollector, makeLot, makeHandover } from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";

afterAll(() => prisma.$disconnect());

async function setupAdmin() {
  const password = "password";
  const account = await prisma.recyclerAccount.create({
    data: { recyclerId: null, email: "admin@example.com", passwordHash: await hashPassword(password), role: "ADMIN" },
  });
  const app = createApp();
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email: account.email, password });
  return { agent, app };
}

async function scoredHandover({ recyclerId, categoryId, collectorId, finalUnitPrice, buyerOfferSnapshot, condition = "GOOD", lotCondition = "GOOD" }) {
  const lot = await makeLot({ categoryId, collectorId, condition: lotCondition });
  return makeHandover({
    lotId: lot.id,
    recyclerId,
    finalUnitPrice,
    // "Published" for a handover is ITS OWN buyerOfferSnapshot — the
    // category-correct accepted rate frozen at acceptance time (see
    // routes/admin.js's GET /recyclers) — not a Rate table lookup.
    buyerOfferSnapshot: buyerOfferSnapshot ?? finalUnitPrice,
    inspectedCondition: condition,
    mlScoredAt: new Date(),
  });
}

describe("GET /admin/recyclers", () => {
  beforeEach(() => truncateAll());

  it("reports insufficient history below MIN_SAMPLE_SIZE scored handovers (never renders as clean)", async () => {
    const { agent } = await setupAdmin();
    const recycler = await makeRecycler();
    const category = await makeCategory();
    const collector = await makeCollector();

    // Only 2 scored handovers — below the default MIN_SAMPLE_SIZE of 5.
    await scoredHandover({ recyclerId: recycler.id, categoryId: category.id, collectorId: collector.id, finalUnitPrice: "190.00" });
    await scoredHandover({ recyclerId: recycler.id, categoryId: category.id, collectorId: collector.id, finalUnitPrice: "195.00" });

    const res = await agent.get("/admin/recyclers");
    expect(res.status).toBe(200);
    const row = res.body.recyclers.find((r) => r.recycler_id === recycler.id);
    expect(row).toBeDefined();
    expect(row.history).toBe("insufficient");
    expect(row.sample_size).toBe(2);
    expect(row.published_rate).toBeUndefined();
  });

  it("computes published-vs-paid and downgrade exception rate once there is enough history", async () => {
    const { agent } = await setupAdmin();
    const recycler = await makeRecycler();
    const category = await makeCategory();
    const collector = await makeCollector();

    // 4 honest, 1 downgraded+underpaid — 5 total, at MIN_SAMPLE_SIZE. Every
    // handover accepted at ₹200 (its own buyerOfferSnapshot).
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      await scoredHandover({ recyclerId: recycler.id, categoryId: category.id, collectorId: collector.id, finalUnitPrice: "198.00", buyerOfferSnapshot: "200.00" });
    }
    await scoredHandover({
      recyclerId: recycler.id, categoryId: category.id, collectorId: collector.id,
      finalUnitPrice: "90.00", buyerOfferSnapshot: "200.00", condition: "POOR", lotCondition: "GOOD",
    });

    const res = await agent.get("/admin/recyclers");
    expect(res.status).toBe(200);
    const row = res.body.recyclers.find((r) => r.recycler_id === recycler.id);
    expect(row.history).toBe("ok");
    expect(row.sample_size).toBe(5);
    expect(row.published_rate).toBe(200);
    expect(row.price_cut_count).toBe(5); // every one of the 5 paid below the ₹200 published rate
    expect(row.downgrade_exception_rate).toBeCloseTo(0.2, 5); // 1 of 5 downgraded
  });

  it("is forbidden for a non-admin session", async () => {
    const recycler = await makeRecycler();
    const password = "password";
    const account = await prisma.recyclerAccount.create({
      data: { recyclerId: recycler.id, email: "r@example.com", passwordHash: await hashPassword(password) },
    });
    const app = createApp();
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ email: account.email, password });

    const res = await agent.get("/admin/recyclers");
    expect(res.status).toBe(403);
  });
});
