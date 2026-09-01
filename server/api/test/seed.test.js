import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, truncateAll } from "./helpers/db.js";
import { seedAll } from "../seed/seed.js";

beforeEach(truncateAll);
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("seedAll", () => {
  it("loads all 161 MPCB rows", async () => {
    await seedAll(prisma);
    expect(await prisma.recycler.count()).toBe(161);
  });

  it("marks exactly 74 of them VALID", async () => {
    await seedAll(prisma);
    expect(await prisma.recycler.count({ where: { authorizationStatus: "VALID" } })).toBe(74);
  });

  it("creates 8 parent and 8 sub-categories", async () => {
    await seedAll(prisma);
    expect(await prisma.category.count({ where: { parentId: null } })).toBe(8);
    expect(await prisma.category.count({ where: { NOT: { parentId: null } } })).toBe(8);
  });

  it("seeds the three condition factors from DB.md 3.5", async () => {
    await seedAll(prisma);
    const rows = await prisma.conditionFactor.findMany({ orderBy: { condition: "asc" } });
    expect(rows.map((r) => [r.condition, Number(r.factor)])).toEqual([
      ["FAIR", 0.85],
      ["GOOD", 1],
      ["POOR", 0.7],
    ]);
  });

  it("creates exactly three console accounts — the three registered buyers", async () => {
    await seedAll(prisma);
    const accounts = await prisma.recyclerAccount.findMany({ include: { recycler: true } });
    expect(accounts).toHaveLength(3);
    for (const a of accounts) expect(a.recycler.authorizationStatus).toBe("VALID");
  });

  it("geocodes Eco-Recycling Ltd, the lapsed one nearest the campus", async () => {
    await seedAll(prisma);
    const r = await prisma.recycler.findFirst({ where: { name: { contains: "Eco-Recycling" } } });
    expect(r.lat).not.toBeNull();
    expect(r.authorizationStatus).toBe("LAPSED_IN_LIST");
  });

  it("publishes rates only for the three registered buyers", async () => {
    await seedAll(prisma);
    const rates = await prisma.rate.findMany({ where: { source: "RECYCLER_PUBLISHED" } });
    expect(new Set(rates.map((r) => r.recyclerId)).size).toBe(3);
  });

  it("is idempotent — running it twice changes no count", async () => {
    await seedAll(prisma);
    const before = {
      recyclers: await prisma.recycler.count(),
      categories: await prisma.category.count(),
      rates: await prisma.rate.count(),
      accounts: await prisma.recyclerAccount.count(),
    };
    await seedAll(prisma);
    expect({
      recyclers: await prisma.recycler.count(),
      categories: await prisma.category.count(),
      rates: await prisma.rate.count(),
      accounts: await prisma.recyclerAccount.count(),
    }).toEqual(before);
  });
});
