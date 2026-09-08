import { prisma } from "../db.js";
import { callPredict } from "./aiml.js";
import { getReferencePrice } from "./referencePrice.js";
import { refreshEntityFlagRate } from "./entityAnomaly.js";
import { log } from "./logger.js";

// Extracted from routes/handover.js (2026-09-07) so the admin rescore
// endpoint (routes/admin.js) calls the exact same scoring path POST /handover
// uses, rather than a second implementation that drifts from it over time.
// No behaviour change on the /handover path — see git history for the diff.

/**
 * Market reference price for a category: the median RECYCLER_PUBLISHED rate
 * (current_rate view — DB.md 3.4) among other VALID recyclers, excluding the
 * recycler in this transaction. Returns null (never throws) if the lookup
 * fails or no other VALID recycler publishes a rate for this category —
 * callers must fall back to the buyer's own rate in that case.
 */
async function marketReferencePrice(categoryId, excludeRecyclerId) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT cr.price
      FROM current_rate cr
      JOIN recycler r ON r.id = cr.recycler_id
      WHERE cr.category_id = ${categoryId}::uuid
        AND cr.recycler_id <> ${excludeRecyclerId}::uuid
        AND r.authorization_status = 'VALID'
    `;
    const prices = rows.map((r) => Number(r.price)).filter((p) => Number.isFinite(p));
    if (prices.length === 0) return null;

    prices.sort((a, b) => a - b);
    const mid = prices.length >> 1;
    const median = prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    return +median.toFixed(2);
  } catch (err) {
    log.handover.warn("market reference lookup failed", { reason: err.message });
    return null;
  }
}

/**
 * Where the reference price for a transaction comes from, best source first.
 *
 * reference_price must be an INDEPENDENT yardstick, not this recycler's own
 * published rate. Sending the same value for reference_price and
 * buyer_offer_per_kg pins buyer_reference_ratio at a constant 1.0 and
 * collapses negotiation_gap_pct into abs_price_deviation_pct — the deployed
 * model ends up running on two independent signals out of five instead of the
 * four it was designed around.
 *
 *   RESOLVED       Metal Mandi, the published external scrap rate. Best: it is
 *                  outside the transaction entirely, so no party to the deal
 *                  can move it.
 *   MARKET_MEDIAN  the median rate other VALID recyclers publish for this
 *                  category. Usable, but circular in the small — the people
 *                  being scored are the ones setting it.
 *   BUYER_FALLBACK the buyer's own accepted rate. A degraded score, and the
 *                  status records that honestly so a flag raised on it can be
 *                  read for what it is.
 */
export async function resolveReferencePrice({ categoryCode, categoryId, recyclerId, buyerOffer, buyerOfferUnit }) {
  if (categoryCode) {
    const external = await getReferencePrice(categoryCode).catch((err) => {
      log.handover.warn("metal mandi lookup failed", { reason: err?.message });
      return null;
    });
    if (external?.status === "RESOLVED" && external.price != null) {
      return { price: external.price, unit: external.unit, status: "RESOLVED" };
    }
  }

  const median = await marketReferencePrice(categoryId, recyclerId);
  if (median != null) {
    return { price: median, unit: buyerOfferUnit, status: "MARKET_MEDIAN" };
  }

  return { price: buyerOffer, unit: buyerOfferUnit, status: "BUYER_FALLBACK" };
}

// The deployed model's response was verified (2026-09-07, against
// https://sihmodel.vercel.app/predict) to only ever return risk_level
// "FLAGGED" or "NORMAL" — the literal string "CRITICAL" this code used to
// branch on never arrives, so the CRITICAL path was unreachable and every
// anomaly flag the system could produce was WARN. CRITICAL is decided here
// instead, from how far past the model's own decision boundary the
// transaction landed. Both constants are deliberately conservative: this is
// a triage signal for a human queue, not an accusation (AI.md §11).
const CRITICAL_ABS_DEVIATION_PCT = 40;
const CRITICAL_SCORE_MARGIN = 0.05;

export function severityFor({ score, threshold, features }) {
  const pastBoundary = Number.isFinite(score) && Number.isFinite(threshold)
    && score <= threshold - CRITICAL_SCORE_MARGIN;
  const absDeviation = features?.abs_price_deviation_pct;
  const deepDeviation = Number.isFinite(absDeviation) && absDeviation >= CRITICAL_ABS_DEVIATION_PCT;
  return pastBoundary || deepDeviation ? "CRITICAL" : "WARN";
}

/**
 * Fire-and-forget: call the Vercel ML model and persist any anomaly flag.
 * Never throws — callers must catch(). Returns a small summary so a caller
 * that DOES want the result (the admin rescore endpoint) can report it,
 * while the original fire-and-forget call site (POST /handover) keeps
 * ignoring the resolved value exactly as before.
 */
export async function scoreHandover({
  handoverId, lotId, recyclerId, collectorId, categoryId, categoryCode,
  buyerOffer, buyerOfferUnit, finalPrice, condition,
}) {
  const reference = await resolveReferencePrice({
    categoryCode, categoryId, recyclerId, buyerOffer, buyerOfferUnit,
  });

  // Record what the score was computed against BEFORE calling the model, so
  // the number survives a model outage. Without this the reference lived only
  // in a log line, and a flag could never be re-checked or explained after the
  // fact.
  await prisma.handover.update({
    where: { id: handoverId },
    data: {
      referencePriceSnapshot: reference.price,
      referencePriceUnit: reference.unit,
      referencePriceStatus: reference.status,
    },
  }).catch((err) => log.handover.warn("reference snapshot write failed", { reason: err?.message }));

  const result = await callPredict({
    reference_price: reference.price,
    buyer_offer_per_kg: buyerOffer,
    final_price_per_kg: finalPrice,
    condition,
  });

  if (!result.ok) {
    log.handover.info("score fail-open", { handoverId, lotId, reason: result.reason });
    return { scored: false, reason: result.reason };
  }

  // Only a handover the model actually verdicted counts toward either
  // party's flag rate (see entityAnomaly.js). Set here, not alongside the
  // reference snapshot above, precisely because this line is unreachable on
  // an outage.
  await prisma.handover.update({
    where: { id: handoverId },
    data: { mlScoredAt: new Date() },
  }).catch((err) => log.handover.warn("ml-scored-at write failed", { reason: err?.message }));

  const { anomaly, score, threshold, risk_level, features } = result.body;
  log.handover.info("scored", { handoverId, lotId, anomaly, score, risk_level });

  let flagId = null;
  let severity = null;
  if (anomaly) {
    severity = severityFor({ score, threshold, features });
    const flag = await prisma.anomalyFlag.create({
      data: {
        subjectType: "HANDOVER",
        subjectId: handoverId,
        detectorCode: "ML_PRICE_ANOMALY",
        severity,
        detail: {
          // Who the flag is about. A flag that names only a handover id makes
          // the reviewer join three tables before they know whose transaction
          // they are looking at.
          collector_id: collectorId,
          recycler_id: recyclerId,
          reference_price: reference.price,
          reference_price_status: reference.status,
          buyer_offer_per_kg: buyerOffer,
          final_price_per_kg: finalPrice,
          score,
          threshold,
          risk_level,
          features,
        },
      },
    }).catch((err) => {
      log.handover.warn("flag write error", { reason: err?.message });
      return null;
    });
    flagId = flag?.id ?? null;
  }

  // Whether THIS transaction was flagged or not, both parties' flag rates
  // need re-checking: a clean transaction can pull a party's rate back below
  // FLAG_RATE_THRESHOLD just as an anomalous one can push it over.
  await Promise.all([
    refreshEntityFlagRate("RECYCLER", recyclerId),
    refreshEntityFlagRate("COLLECTOR", collectorId),
  ]);

  return { scored: true, anomaly: !!anomaly, severity, flagId };
}
