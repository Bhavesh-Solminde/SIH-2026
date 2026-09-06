import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, truncateAll } from "./helpers/db.js";
import { seedAll } from "../seed/seed.js";

// seedAll writes 161 recyclers, 16 categories, 3 condition factors and 3 console
// accounts. DATABASE_URL_TEST points at a REMOTE database (see test/setup.js), so
// every one of those writes is network-bound. The previous shape —
// beforeEach(truncateAll) plus `await seedAll(prisma)` inside each `it` — seeded
// the whole corpus 8 times per run and blew the 15s timeout on all 8.
//
// Every assertion in this file is read-only, so the corpus is built once and
// shared. The one test that genuinely needs a second seed (idempotency) calls
// seedAll itself. Nothing else in this file mutates the corpus; the package runs
// test files serially (fileParallelism: false + singleFork), so no other file can
// truncate it mid-run.
beforeAll(async () => {
  await truncateAll();
  await seedAll(prisma);
}, 120_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("seedAll", () => {
  it("loads all 161 MPCB rows", async () => {
    expect(await prisma.recycler.count()).toBe(161);
  });

  it("marks exactly 74 of them VALID", async () => {
    expect(await prisma.recycler.count({ where: { authorizationStatus: "VALID" } })).toBe(74);
  });

  it("creates 8 parent and 8 sub-categories", async () => {
    expect(await prisma.category.count({ where: { parentId: null } })).toBe(8);
    expect(await prisma.category.count({ where: { NOT: { parentId: null } } })).toBe(8);
  });

  it("seeds the three condition factors from DB.md 3.5", async () => {
    const rows = await prisma.conditionFactor.findMany({ orderBy: { condition: "asc" } });
    expect(rows.map((r) => [r.condition, Number(r.factor)])).toEqual([
      ["FAIR", 0.85],
      ["GOOD", 1],
      ["POOR", 0.7],
    ]);
  });

  it("creates exactly three console accounts — the three registered buyers", async () => {
    const accounts = await prisma.recyclerAccount.findMany({ include: { recycler: true } });
    expect(accounts).toHaveLength(3);
    for (const a of accounts) expect(a.recycler.authorizationStatus).toBe("VALID");
  });

  it("geocodes Eco-Recycling Ltd, the lapsed one nearest the campus", async () => {
    const r = await prisma.recycler.findFirst({ where: { name: { contains: "Eco-Recycling" } } });
    expect(r.lat).not.toBeNull();
    expect(r.authorizationStatus).toBe("LAPSED_IN_LIST");
  });

  it("publishes rates only for the three registered buyers", async () => {
    const rates = await prisma.rate.findMany({ where: { source: "RECYCLER_PUBLISHED" } });
    expect(new Set(rates.map((r) => r.recyclerId)).size).toBe(3);
  });

  // This is the one test that must run seedAll a second time — that is the
  // behaviour under test. It runs on top of the beforeAll corpus, which is
  // exactly the "twice" the name describes.
  it("is idempotent — running it twice changes no count", async () => {
    const before = {
      recyclers: await prisma.recycler.count(),
      categories: await prisma.category.count(),
      accounts: await prisma.recyclerAccount.count(),
    };

    await seedAll(prisma);

    expect(await prisma.recycler.count()).toBe(before.recyclers);
    expect(await prisma.category.count()).toBe(before.categories);
    expect(await prisma.recyclerAccount.count()).toBe(before.accounts);
  }, 60_000);
});
