import { RANKING_WEIGHTS, STALENESS_NORM_DAYS } from "./constants.js";
import { haversineKm } from "./geo.js";

const DAY_MS = 86_400_000;

/**
 * Min-max normalise to [0,1]. When every candidate is identical the term
 * carries no information, so it collapses to a constant.
 */
function normalise(values, fallback) {
  const present = values.filter((v) => v !== null && Number.isFinite(v));
  if (present.length === 0) return values.map(() => fallback);
  const min = Math.min(...present);
  const max = Math.max(...present);
  if (max === min) return values.map((v) => (v === null ? fallback : 0));
  return values.map((v) => (v === null ? fallback : (v - min) / (max - min)));
}

/**
 * Rank recyclers for a collector's lot.
 *
 * Scoring (all terms normalised to [0,1]):
 *
 *   score = w_rateMatch * rateMatchScore
 *         - w_distance  * normDistance
 *         - w_staleness * normStaleness
 *
 * rateMatchScore = 1 - |recyclerRate - collectorExpectedRate| / max(recyclerRate, collectorExpectedRate)
 *   → 1.0 when rates match exactly, 0.0 when maximally different.
 *   → When collectorExpectedRate is null/0, falls back to 0.5 (neutral),
 *     and ranking is driven by distance + staleness only.
 *
 * Hard eligibility gates (applied before scoring):
 *   1. authorizationStatus === "VALID"
 *   2. materialsAccepted includes the lot's categoryCode
 *   3. Rate must exist for the category
 *   4. Distance <= serviceAreaKm (skipped when GPS unavailable)
 *
 * @param {object} params
 * @param {object} params.lot             - { categoryCode, quantity, unit, condition, collectionLat, collectionLng }
 * @param {Array}  params.recyclers       - recycler rows with lat, lng, authorizationStatus, materialsAccepted, serviceAreaKm
 * @param {Array}  params.rates           - rate rows with recyclerId, categoryCode, price, unit, validFrom
 * @param {object} params.from            - { lat, lng } collector GPS, or null
 * @param {string} params.asOf            - ISO date string (now)
 * @param {number} [params.collectorExpectedRate] - collector's entered expected rate per unit
 * @param {object} [params.weights]       - override RANKING_WEIGHTS
 * @param {string} [params.sortBy]        - "score" | "rate" | "distance"
 */
export function rankRecyclers({
  lot,
  recyclers,
  rates,
  from,
  asOf,
  collectorExpectedRate = null,
  weights = RANKING_WEIGHTS,
  sortBy = "score",
}) {
  const asOfMs = new Date(asOf).getTime();
  const rateFor = new Map();
  for (const r of rates) {
    if (r.categoryCode === lot.categoryCode) rateFor.set(r.recyclerId, r);
  }
  // Subcategory fallback: if lot is e.g. PCB_COMPUTER but rates are for PCB,
  // use the parent rate so collectors aren't shown an empty list.
  if (rateFor.size === 0 && lot.categoryCode?.includes('_')) {
    const parentCode = lot.categoryCode.split('_')[0];
    for (const r of rates) {
      if (r.categoryCode === parentCode) rateFor.set(r.recyclerId, r);
    }
  }

  // ── Hard eligibility gate ──────────────────────────────────────────────
  const eligible = [];
  for (const rec of recyclers) {
    if (rec.authorizationStatus !== "VALID") continue;
    const materials = rec.materialsAccepted ?? [];
    if (materials.length > 0 && !materials.includes(lot.categoryCode)) continue;

    const rate = rateFor.get(rec.id);
    if (!rate) continue;

    const distanceKm = haversineKm(from, { lat: rec.lat, lng: rec.lng });
    if (distanceKm !== null && distanceKm > (rec.serviceAreaKm ?? 25)) continue;

    const unitPrice = Number(rate.price);
    const qty = lot.quantity ?? 0;
    const conditionFactor = { GOOD: 1.0, FAIR: 0.85, POOR: 0.70 }[lot.condition] ?? 1.0;
    const estimatedValue = qty * unitPrice * conditionFactor;

    const stalenessDays = Math.max(
      0,
      Math.floor((asOfMs - new Date(rate.validFrom).getTime()) / DAY_MS),
    );

    // Rate match: how close is the recycler's rate to the collector's expected rate?
    let rateMatchScore = 0.5; // neutral when no expected rate given
    if (collectorExpectedRate && collectorExpectedRate > 0 && unitPrice > 0) {
      const diff = Math.abs(unitPrice - collectorExpectedRate);
      const maxVal = Math.max(unitPrice, collectorExpectedRate);
      rateMatchScore = 1 - diff / maxVal; // 1.0 = perfect match, 0.0 = maximally different
    }

    eligible.push({
      recyclerId:          rec.id,
      name:                rec.name,
      unit:                rate.unit,
      unitPrice,
      estimatedValue,
      rateValidFrom:       rate.validFrom,
      distanceKm,
      stalenessDays,
      rateMatchScore,
      authorizationStatus: rec.authorizationStatus,
      materialsAccepted:   rec.materialsAccepted ?? [],
      recommended:         false,
    });
  }

  if (eligible.length === 0) return [];

  // ── Normalise distance and staleness ──────────────────────────────────
  const nDist  = normalise(eligible.map((e) => e.distanceKm), 0.5);
  const nStale = eligible.map((e) => Math.min(e.stalenessDays / STALENESS_NORM_DAYS, 1));

  const scored = eligible.map((e, i) => ({
    ...e,
    score:
      weights.rateMatch  * e.rateMatchScore -
      weights.distance   * nDist[i] -
      weights.staleness  * nStale[i],
  }));

  const comparators = {
    score:    (a, b) => b.score - a.score,
    rate:     (a, b) => b.unitPrice - a.unitPrice,
    distance: (a, b) =>
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
  };
  scored.sort(comparators[sortBy] ?? comparators.score);

  if (sortBy === "score") scored[0].recommended = true;
  return scored;
}
