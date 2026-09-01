import { makePrismaClient } from "../helpers/prismaTestClient.js";

let prisma;
beforeEach(async () => {
  prisma = await makePrismaClient();
});
afterEach(async () => {
  await prisma.$disconnect();
});

describe("device migration", () => {
  it("creates every model table", async () => {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = rows.map((r) => r.name);
    for (const t of [
      "acceptance",
      "category",
      "collector",
      "condition_factor",
      "handover",
      "lot",
      "meta",
      "outbox",
      "photo",
      "rate",
      "recycler",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("lets a collector and a lot round-trip through the model API", async () => {
    await prisma.collector.create({
      data: { id: "c1", preferredLanguage: "mr", createdAt: new Date().toISOString() },
    });
    const lot = await prisma.lot.create({
      data: {
        id: "l1",
        collectorId: "c1",
        categoryId: "cat1",
        categoryCode: "PCB",
        unit: "KG",
        quantity: 3,
        condition: "GOOD",
        estimatedValue: 1260,
        collectionTs: "2026-09-02T10:14:00+05:30",
        status: "DRAFT",
        deviceId: "pixel",
        createdAt: new Date().toISOString(),
      },
    });
    expect(lot.id).toBe("l1");
  });

  it("indexes the outbox on synced_at so draining is a single scan", async () => {
    const idx = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='outbox_pending'",
    );
    expect(idx).toHaveLength(1);
  });
});
