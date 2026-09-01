import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";

beforeEach(truncateAll);
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("handover_confirmed_needs_both_signatures", () => {
  it("permits the intermediate state where only the recycler has signed", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    const col = await makeCollector();
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    const h = await makeHandover({
      lotId: lot.id,
      recyclerId: rec.id,
      recyclerConfirmedAt: new Date(),
      status: "PENDING_COLLECTOR",
    });
    expect(h.status).toBe("PENDING_COLLECTOR");
  });

  it("refuses CONFIRMED when only the recycler has signed", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    const col = await makeCollector();
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    await expect(
      makeHandover({
        lotId: lot.id,
        recyclerId: rec.id,
        recyclerConfirmedAt: new Date(),
        status: "CONFIRMED",
      }),
    ).rejects.toThrow(/handover_confirmed_needs_both_signatures/);
  });

  it("refuses CONFIRMED when only the collector has signed", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    const col = await makeCollector();
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    await expect(
      makeHandover({
        lotId: lot.id,
        recyclerId: rec.id,
        collectorConfirmedAt: new Date(),
        status: "CONFIRMED",
      }),
    ).rejects.toThrow(/handover_confirmed_needs_both_signatures/);
  });

  it("allows CONFIRMED once both signatures exist", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    const col = await makeCollector();
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    const h = await makeHandover({
      lotId: lot.id,
      recyclerId: rec.id,
      recyclerConfirmedAt: new Date(),
      collectorConfirmedAt: new Date(),
      status: "CONFIRMED",
    });
    expect(h.status).toBe("CONFIRMED");
  });

  it("enforces one handover per lot", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    const col = await makeCollector();
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    await makeHandover({ lotId: lot.id, recyclerId: rec.id });
    await expect(
      makeHandover({ lotId: lot.id, recyclerId: rec.id, referenceCode: "OTHERCOD" }),
    ).rejects.toThrow();
  });
});

describe("rate is append-only", () => {
  it("rejects an UPDATE", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    const r = await prisma.rate.create({
      data: {
        recyclerId: rec.id,
        categoryId: cat.id,
        unit: "KG",
        price: "400.00",
        source: "RECYCLER_PUBLISHED",
      },
    });
    await expect(
      prisma.rate.update({ where: { id: r.id }, data: { price: "500.00" } }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects a DELETE", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    const r = await prisma.rate.create({
      data: {
        recyclerId: rec.id,
        categoryId: cat.id,
        unit: "KG",
        price: "400.00",
        source: "RECYCLER_PUBLISHED",
      },
    });
    await expect(prisma.rate.delete({ where: { id: r.id } })).rejects.toThrow(/append-only/);
  });
});

describe("current_rate view", () => {
  it("returns the newest RECYCLER_PUBLISHED row per recycler and category", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    for (const [price, day] of [
      ["300.00", "2026-08-30T09:00:00+05:30"],
      ["420.00", "2026-09-01T09:00:00+05:30"],
    ]) {
      await prisma.rate.create({
        data: {
          recyclerId: rec.id,
          categoryId: cat.id,
          unit: "KG",
          price,
          source: "RECYCLER_PUBLISHED",
          validFrom: new Date(day),
        },
      });
    }
    const rows = await prisma.$queryRaw`SELECT * FROM current_rate`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].price)).toBe(420);
  });

  it("ignores MARKET_INDICATIVE rows — they are never shown as the price", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    await prisma.rate.create({
      data: {
        recyclerId: rec.id,
        categoryId: cat.id,
        unit: "KG",
        price: "9999.00",
        source: "MARKET_INDICATIVE",
        validFrom: new Date("2026-09-02T09:00:00+05:30"),
      },
    });
    const rows = await prisma.$queryRaw`SELECT * FROM current_rate`;
    expect(rows).toHaveLength(0);
  });
});

describe("controlled vocabularies", () => {
  it("rejects a lot condition outside GOOD/FAIR/POOR", async () => {
    const [cat] = [await makeCategory()];
    const col = await makeCollector();
    await expect(
      makeLot({ collectorId: col.id, categoryId: cat.id, condition: "UNKNOWN" }),
    ).rejects.toThrow(/lot_condition_check/);
  });

  it("rejects a zero quantity", async () => {
    const [cat] = [await makeCategory()];
    const col = await makeCollector();
    await expect(
      makeLot({ collectorId: col.id, categoryId: cat.id, quantity: "0.000" }),
    ).rejects.toThrow(/lot_quantity_check/);
  });

  it("accepts MARKET as an anomaly subject type — D13 needs it", async () => {
    const f = await prisma.anomalyFlag.create({
      data: {
        subjectType: "MARKET",
        subjectId: "00000000-0000-7000-8000-000000000000",
        detectorCode: "D13",
        severity: "WARN",
        detail: { valid_recyclers: 1, downgrade_rate: 0.85, n: 31 },
      },
    });
    expect(f.subjectType).toBe("MARKET");
  });

  it("rejects a downgrade reason outside the fixed list", async () => {
    const [cat, rec] = [await makeCategory(), await makeRecycler()];
    const col = await makeCollector();
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    await expect(
      makeHandover({ lotId: lot.id, recyclerId: rec.id, downgradeReasonCode: "BECAUSE_I_SAID" }),
    ).rejects.toThrow(/handover_downgrade_reason_check/);
  });
});
