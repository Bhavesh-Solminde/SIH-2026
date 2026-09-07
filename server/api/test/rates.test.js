import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeRecycler, makeCategory } from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";

afterAll(() => prisma.$disconnect());

async function setupRecycler() {
  const recycler = await makeRecycler();
  const passwordHash = await hashPassword("hunter2");
  const account = await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email: "rates@example.com", passwordHash },
  });
  return { recycler, account };
}

async function loginAgent(app, email = "rates@example.com", password = "hunter2") {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password });
  return agent;
}

describe("POST /recycler/rates", () => {
  beforeEach(() => truncateAll());

  it("publishes new rate rows (append-only)", async () => {
    const app = createApp();
    const { recycler } = await setupRecycler();
    const cat = await makeCategory({ code: "PCB" });
    const agent = await loginAgent(app);

    const res = await agent.post("/recycler/rates").send([
      { categoryCode: "PCB", unit: "KG", price: 420 },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(1);

    const rates = await prisma.rate.findMany({
      where: { recyclerId: recycler.id, categoryId: cat.id },
    });
    expect(rates.length).toBe(1);
    expect(rates[0].source).toBe("RECYCLER_PUBLISHED");
    expect(Number(rates[0].price)).toBe(420);
  });

  it("is append-only — second publish adds a new row, never updates", async () => {
    const app = createApp();
    const { recycler } = await setupRecycler();
    const cat = await makeCategory({ code: "PCB" });
    const agent = await loginAgent(app);

    await agent
      .post("/recycler/rates")
      .send([{ categoryCode: "PCB", unit: "KG", price: 400 }]);

    await agent
      .post("/recycler/rates")
      .send([{ categoryCode: "PCB", unit: "KG", price: 450 }]);

    const rates = await prisma.rate.findMany({
      where: { recyclerId: recycler.id, categoryId: cat.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rates.length).toBe(2);
    expect(Number(rates[0].price)).toBe(400);
    expect(Number(rates[1].price)).toBe(450);
  });

  it("returns 400 for unknown category code", async () => {
    const app = createApp();
    await setupRecycler();
    const agent = await loginAgent(app);

    const res = await agent
      .post("/recycler/rates")
      .send([{ categoryCode: "UNKNOWN_CODE", unit: "KG", price: 100 }]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unknown_category_codes");
  });

  it("requires session — 401 without cookie", async () => {
    const res = await request(createApp())
      .post("/recycler/rates")
      .send([{ categoryCode: "PCB", unit: "KG", price: 100 }]);
    expect(res.status).toBe(401);
  });
});

describe("GET /recycler/rates", () => {
  beforeEach(() => truncateAll());

  it("returns only the latest rate per category (current_rate view)", async () => {
    const app = createApp();
    const { recycler } = await setupRecycler();
    const cat = await makeCategory({ code: "PCB" });
    const agent = await loginAgent(app);

    // Insert two rates — only the latest should appear
    await prisma.rate.createMany({
      data: [
        {
          recyclerId: recycler.id,
          categoryId: cat.id,
          unit: "KG",
          price: 300,
          source: "RECYCLER_PUBLISHED",
          validFrom: new Date("2026-08-01T00:00:00Z"),
        },
        {
          recyclerId: recycler.id,
          categoryId: cat.id,
          unit: "KG",
          price: 420,
          source: "RECYCLER_PUBLISHED",
          validFrom: new Date("2026-08-15T00:00:00Z"),
        },
      ],
    });

    const res = await agent.get("/recycler/rates");
    expect(res.status).toBe(200);
    // GET /recycler/rates answers { rates: [...] } — the shape the console
    // destructures at client/console/src/app/(protected)/rates/page.jsx:18.
    // Each row is per-category and carries categoryCode, not code, and price
    // as a Number rather than the raw Decimal string.
    expect(res.body.rates.length).toBe(1);
    expect(res.body.rates[0].price).toBe(420);
    expect(res.body.rates[0].categoryCode).toBe("PCB");
  });

  it("returns 401 without session", async () => {
    const res = await request(createApp()).get("/recycler/rates");
    expect(res.status).toBe(401);
  });
});
