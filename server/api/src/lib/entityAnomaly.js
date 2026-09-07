import { prisma } from "../db.js";
import { log } from "./logger.js";

// Whether a RECYCLER or a COLLECTOR is anomalous is decided from the SHARE of
// their own transactions the deployed price model flagged — never a raw
// count. A raw count treats a 2-transaction recycler and a 200-transaction
// one identically: one flagged sale means nothing for the first and
// everything for the second. The rate self-adjusts as more transactions
// accumulate; there is no number in this file that names a transaction count
// as the line to cross.
//
// This supersedes the eleven rule-based detectors (D1-D13, AI-ANOMALY-SPEC.md)
// for the live product. Their thresholds were fixed at build time over
// simulated history; this reads the deployed model's own verdict
// (ML_PRICE_ANOMALY, written by scoreHandover in routes/handover.js and by
// POST /recycler/flags/check) and aggregates it per party. See AI.md §9 and
// AI-ANOMALY-SPEC.md §0.1 for the superseded note.
const MIN_SAMPLE_SIZE = Number(process.env.ANOMALY_MIN_SAMPLE ?? 5);

// Share of a party's own scored transactions that must be flagged before the
// PARTY (not just the transaction) is treated as anomalous. Configuration,
// not code — AI-ANOMALY-SPEC.md gap #1 makes the same argument for detector
// thresholds generally: a cutoff belongs in config so it can be retuned
// without a deploy.
const FLAG_RATE_THRESHOLD = Number(process.env.ANOMALY_FLAG_RATE_THRESHOLD ?? 0.2);

const DETECTOR_CODE = "ML_FLAG_RATE";

async function scoredHandoverIds(where) {
  // "Scored" = the model actually returned a verdict (mlScoredAt is set by
  // scoreHandover/POST /recycler/flags/check only on a successful callPredict
  // — never on the outage path, which fails open). A handover the model
  // never got to is missing data, not a clean transaction — it must count
  // toward neither the denominator nor the numerator.
  const rows = await prisma.handover.findMany({
    where: { ...where, mlScoredAt: { not: null } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function flaggedCount(handoverIds) {
  if (handoverIds.length === 0) return 0;
  return prisma.anomalyFlag.count({
    where: {
      subjectType: "HANDOVER",
      subjectId: { in: handoverIds },
      detectorCode: "ML_PRICE_ANOMALY",
    },
  });
}

/**
 * Recompute one party's flag rate and keep their entity-level flag in sync
 * with it: write/refresh it while the rate is at or above the threshold,
 * resolve it the moment the rate drops back below. Below MIN_SAMPLE_SIZE
 * scored transactions the rate is statistical noise either direction, so the
 * party is reported "insufficient_history" and left untouched — mirrors
 * AI-ANOMALY-SPEC.md's cold-start rule: never let no data render as either
 * verdict.
 *
 * subjectType: "RECYCLER" | "COLLECTOR". Never throws — every caller is a
 * fire-and-forget path off a live transaction.
 */
export async function refreshEntityFlagRate(subjectType, subjectId) {
  try {
    const where = subjectType === "RECYCLER"
      ? { recyclerId: subjectId }
      : { lot: { collectorId: subjectId } };

    const handoverIds = await scoredHandoverIds(where);
    const total = handoverIds.length;
    if (total < MIN_SAMPLE_SIZE) {
      return { status: "insufficient_history", total, minSample: MIN_SAMPLE_SIZE };
    }

    const flagged = await flaggedCount(handoverIds);
    const rate = flagged / total;

    const existing = await prisma.anomalyFlag.findFirst({
      where: { subjectType, subjectId, detectorCode: DETECTOR_CODE, resolvedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (rate < FLAG_RATE_THRESHOLD) {
      if (existing) {
        await prisma.anomalyFlag.update({
          where: { id: existing.id },
          data: { resolvedAt: new Date() },
        });
      }
      return { status: "clear", total, flagged, rate };
    }

    const severity = rate >= FLAG_RATE_THRESHOLD * 2 ? "CRITICAL" : "WARN";
    const detail = { total, flagged, rate: +rate.toFixed(4), threshold: FLAG_RATE_THRESHOLD };

    // One live flag per party, refreshed in place as the rate moves — a
    // worsening or improving rate updates the existing row's numbers rather
    // than piling up a new flag on every transaction.
    const flag = existing
      ? await prisma.anomalyFlag.update({ where: { id: existing.id }, data: { severity, detail } })
      : await prisma.anomalyFlag.create({ data: { subjectType, subjectId, detectorCode: DETECTOR_CODE, severity, detail } });

    return { status: "flagged", ...detail, flagId: flag.id };
  } catch (err) {
    log.detect.warn("entity flag-rate refresh failed", { subjectType, subjectId, reason: err?.message });
    return { status: "error", reason: err?.message };
  }
}
