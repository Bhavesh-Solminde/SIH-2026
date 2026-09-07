/**
 * entityAnomaly.js — the per-party flag rate that replaced the rule-based
 * detectors (D1-D13) as the source of RECYCLER/COLLECTOR-level anomaly
 * status. See AI.md §9 and AI-ANOMALY-SPEC.md §0.1 for the superseded note.
 *
 * DB: bhaav_test (port 5433). Serial execution. truncateAll in beforeEach.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { uuidv7 } from "@bhaav/core/ids";
import {
  prisma, truncateAll, makeRecycler, makeCollector, makeCategory, makeLot, makeHandover,
} from "./helpers/db.js";
import { refreshEntityFlagRate } from "../src/lib/entityAnomaly.js";

afterAll(() => prisma.$disconnect());

// Both ANOMALY_MIN_SAMPLE and ANOMALY_FLAG_RATE_THRESHOLD are read from
// process.env at call time (no module-level caching), so a test can override
// them without needing to reset modules.
const MIN_SAMPLE = 5;
const THRESHOLD = 0.2;

beforeEach(async () => {
  await truncateAll();
  process.env.ANOMALY_MIN_SAMPLE = String(MIN_SAMPLE);
  process.env.ANOMALY_FLAG_RATE_THRESHOLD = String(THRESHOLD);
});

async function scoredHandover({ recyclerId, collectorId, categoryId, flagged, scored = true }) {
  const lot = await makeLot({ collectorId, categoryId });
  const handover = await makeHandover({
    lotId: lot.id,
    recyclerId,
    mlScoredAt: scored ? new Date() : null,
  });
  if (flagged) {
    await prisma.anomalyFlag.create({
      data: {
        subjectType: "HANDOVER",
        subjectId: handover.id,
        detectorCode: "ML_PRICE_ANOMALY",
        severity: "WARN",
        detail: {},
      },
    });
  }
  return handover;
}

describe("refreshEntityFlagRate", () => {
  it("reports insufficient_history below the minimum sample size", async () => {
    const recycler = await makeRecycler();
    const collector = await makeCollector();
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });

    // Only 2 scored transactions — below MIN_SAMPLE (5).
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });

    const result = await refreshEntityFlagRate("RECYCLER", recycler.id);
    expect(result.status).toBe("insufficient_history");

    const flag = await prisma.anomalyFlag.findFirst({
      where: { subjectType: "RECYCLER", subjectId: recycler.id, detectorCode: "ML_FLAG_RATE" },
    });
    expect(flag).toBeNull();
  });

  it("does not count an un-scored handover (model outage) in either the numerator or denominator", async () => {
    const recycler = await makeRecycler();
    const collector = await makeCollector();
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });

    for (let i = 0; i < 5; i++) {
      await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    }
    // An un-scored handover with an (impossible in practice, but illustrative)
    // flag attached must still be excluded — mlScoredAt is what counts.
    await scoredHandover({
      recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true, scored: false,
    });

    const result = await refreshEntityFlagRate("RECYCLER", recycler.id);
    expect(result.status).toBe("clear");
    expect(result.total).toBe(5);
  });

  it("flags a recycler once their OWN flag rate crosses the threshold", async () => {
    const recycler = await makeRecycler();
    const collector = await makeCollector();
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });

    // 5 scored, 1 flagged = 20%, right at the threshold — flagged (rate < threshold
    // is false at equality) but not yet CRITICAL (that needs 2x the threshold).
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });

    const result = await refreshEntityFlagRate("RECYCLER", recycler.id);
    expect(result.status).toBe("flagged");
    expect(result.total).toBe(5);
    expect(result.flagged).toBe(1);
    expect(result.rate).toBeCloseTo(0.2, 4);

    const flag = await prisma.anomalyFlag.findFirst({
      where: { subjectType: "RECYCLER", subjectId: recycler.id, detectorCode: "ML_FLAG_RATE", resolvedAt: null },
    });
    expect(flag).not.toBeNull();
    expect(flag.severity).toBe("WARN");
  });

  it("escalates to CRITICAL once the rate reaches double the threshold", async () => {
    const recycler = await makeRecycler();
    const collector = await makeCollector();
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });

    // 5 scored, 2 flagged = 40% = 2x the 20% threshold.
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });

    const result = await refreshEntityFlagRate("RECYCLER", recycler.id);
    expect(result.status).toBe("flagged");

    const flag = await prisma.anomalyFlag.findFirst({
      where: { subjectType: "RECYCLER", subjectId: recycler.id, detectorCode: "ML_FLAG_RATE", resolvedAt: null },
    });
    expect(flag.severity).toBe("CRITICAL");
  });

  it("the SAME recycler with the SAME 2/5 rate as a 200-transaction history stays clear — it is a rate, not a count", async () => {
    const recycler = await makeRecycler();
    const collector = await makeCollector();
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });

    // 20 scored, 2 flagged = 10% < 20% threshold — the SAME raw flagged count
    // (2) as the test above, but clear here because the denominator is bigger.
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });
    for (let i = 0; i < 18; i++) {
      await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    }

    const result = await refreshEntityFlagRate("RECYCLER", recycler.id);
    expect(result.status).toBe("clear");
    expect(result.flagged).toBe(2);
    expect(result.total).toBe(20);
  }, 30_000); // 20 sequential DB round trips against a remote pooler

  it("re-clears a previously flagged recycler once their rate drops back below threshold", async () => {
    const recycler = await makeRecycler();
    const collector = await makeCollector();
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });

    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: true });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    const flaggedResult = await refreshEntityFlagRate("RECYCLER", recycler.id);
    expect(flaggedResult.status).toBe("flagged");

    // 15 more clean transactions dilute the rate to 2/20 = 10%.
    for (let i = 0; i < 15; i++) {
      await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: false });
    }
    const clearedResult = await refreshEntityFlagRate("RECYCLER", recycler.id);
    expect(clearedResult.status).toBe("clear");

    const flag = await prisma.anomalyFlag.findFirst({
      where: { subjectType: "RECYCLER", subjectId: recycler.id, detectorCode: "ML_FLAG_RATE" },
      orderBy: { createdAt: "desc" },
    });
    expect(flag.resolvedAt).not.toBeNull();
  }, 30_000); // 20 sequential DB round trips against a remote pooler

  it("scores a collector (seller) independently of any recycler (buyer)", async () => {
    const collector = await makeCollector();
    const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });
    // Different recyclers buying from the SAME collector — the collector's
    // rate is per-collector across all their sales, not tied to one buyer.
    // uuidv7's leading bytes barely change across calls milliseconds apart —
    // slicing one down to a short prefix collides inside a tight loop like
    // this. The loop index is what actually guarantees uniqueness here.
    for (let i = 0; i < 5; i++) {
      const recycler = await makeRecycler({ registrationNo: `REG-${i}-${uuidv7()}` });
      await scoredHandover({ recyclerId: recycler.id, collectorId: collector.id, categoryId: category.id, flagged: i < 3 });
    }

    const result = await refreshEntityFlagRate("COLLECTOR", collector.id);
    expect(result.status).toBe("flagged");
    expect(result.total).toBe(5);
    expect(result.flagged).toBe(3);
  });
});
