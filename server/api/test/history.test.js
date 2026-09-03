import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  prisma,
  truncateAll,
  makeRecycler,
  makeCategory,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";

afterAll(() => prisma.$disconnect());

async function setupAuth() {
  const recycler = await makeRecycler();
  const password = "password";
  const passwordHash = await hashPassword(password);
  const account = await prisma.recyclerAccount.create({
    data: {
      recyclerId: recycler.id,
      email: "test@example.com",
      passwordHash,
    },
  });

  const app = createApp();
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email: account.email, password });
  return { recycler, agent, app };
}

describe("GET /recycler/history", () => {
  beforeEach(() => truncateAll());

  it("requires session", async () => {
    const app = createApp();
    const res = await request(app).get("/recycler/history");
    expect(res.status).toBe(401);
  });

  it("returns empty list when no handovers", async () => {
    const { agent } = await setupAuth();
    const res = await agent.get("/recycler/history");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("returns CONFIRMED handover with three prices, but not PENDING_COLLECTOR", async () => {
    const { recycler, agent } = await setupAuth();
    const category = await makeCategory();
    const collector = await makeCollector();
    const lot1 = await makeLot({ categoryId: category.id, collectorId: collector.id });
    const lot2 = await makeLot({ categoryId: category.id, collectorId: collector.id });

    // Accepted rate (what collector saw) -> acceptance table
    await prisma.acceptance.create({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        lotId: lot1.id,
        recyclerId: recycler.id,
        acceptedRate: "385.00",
        acceptedUnit: "KG",
        acceptedTs: new Date(),
        recyclerResponse: "ACKNOWLEDGED",
        responseTs: new Date(),
      },
    });

    // Confirmed handover
    const h1 = await makeHandover({
      lotId: lot1.id,
      recyclerId: recycler.id,
      status: "CONFIRMED",
      finalUnitPrice: "390.00",
      finalTotal: "1131.00",
      collectorConfirmedAt: new Date(),
      recyclerConfirmedAt: new Date(),
    });

    // Pending handover
    await makeHandover({
      lotId: lot2.id,
      recyclerId: recycler.id,
      status: "PENDING_COLLECTOR",
    });

    const res = await agent.get("/recycler/history");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    
    const h = res.body.data[0];
    expect(h.id).toBe(h1.id);
    expect(h.status).toBe("CONFIRMED");
    expect(h.accepted_rate).toBe(385);
    expect(h.final_unit_price).toBe(390);
    expect(h.final_total).toBe(1131);
  });

  it("pagination: page=1 returns first 20, totalPages reflects count", async () => {
    const { recycler, agent } = await setupAuth();
    const category = await makeCategory();
    const collector = await makeCollector();
    
    // create 25 handovers
    for (let i = 0; i < 25; i++) {
      const lot = await makeLot({ categoryId: category.id, collectorId: collector.id });
      await makeHandover({
        lotId: lot.id,
        recyclerId: recycler.id,
        status: "CONFIRMED",
        collectorConfirmedAt: new Date(),
        recyclerConfirmedAt: new Date(),
      });
    }

    const res = await agent.get("/recycler/history?page=1&limit=20");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.total).toBe(25);
    expect(res.body.totalPages).toBe(2);

    const res2 = await agent.get("/recycler/history?page=2&limit=20");
    expect(res2.status).toBe(200);
    expect(res2.body.data).toHaveLength(5);
  });

  it("from/to date filter works", async () => {
    const { recycler, agent } = await setupAuth();
    const category = await makeCategory();
    const collector = await makeCollector();
    
    const lot1 = await makeLot({ categoryId: category.id, collectorId: collector.id });
    const lot2 = await makeLot({ categoryId: category.id, collectorId: collector.id });
    const lot3 = await makeLot({ categoryId: category.id, collectorId: collector.id });

    await makeHandover({ lotId: lot1.id, recyclerId: recycler.id, status: "CONFIRMED", handoverTs: new Date("2026-09-01T10:00:00Z"), collectorConfirmedAt: new Date(), recyclerConfirmedAt: new Date() });
    await makeHandover({ lotId: lot2.id, recyclerId: recycler.id, status: "CONFIRMED", handoverTs: new Date("2026-09-02T10:00:00Z"), collectorConfirmedAt: new Date(), recyclerConfirmedAt: new Date() });
    await makeHandover({ lotId: lot3.id, recyclerId: recycler.id, status: "CONFIRMED", handoverTs: new Date("2026-09-03T10:00:00Z"), collectorConfirmedAt: new Date(), recyclerConfirmedAt: new Date() });

    const res = await agent.get("/recycler/history?from=2026-09-01T12:00:00Z&to=2026-09-02T12:00:00Z");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].handover_ts).toBe(new Date("2026-09-02T10:00:00Z").toISOString());
  });

  it("CSV export: Content-Type text/csv, contains reference_code header", async () => {
    const { recycler, agent } = await setupAuth();
    const category = await makeCategory();
    const collector = await makeCollector();
    const lot = await makeLot({ categoryId: category.id, collectorId: collector.id });
    await makeHandover({ lotId: lot.id, recyclerId: recycler.id, status: "CONFIRMED", collectorConfirmedAt: new Date(), recyclerConfirmedAt: new Date() });

    const res = await agent.get("/recycler/history?format=csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("reference_code,handover_ts,status,category_code");
    expect(res.text.split("\n")).toHaveLength(2); // Header + 1 row
  });
});
