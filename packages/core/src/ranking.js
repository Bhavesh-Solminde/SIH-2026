import { RANKING_WEIGHTS, STALENESS_NORM_DAYS } from "./constants.js";
import { haversineKm } from "./geo.js";
import { estimateValue } from "./pricing.js";

const DAY_MS = 86_400_000;

/**
 * Min-max normalise to [0,1]. When every candidate is identical the term
 * carries no information, so it collapses to a constant and cannot decide
 * the ordering.
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
 * The recycler-matching score from AI.md section 2:
 *
 *   score = w1 * normalised_value
 *         - w2 * normalised_distance
 *         + w3 * pickup_available
 *         - w4 * rate_staleness
 *
 * NOTE ON STALENESS. AI.md writes the last term as `w4 * rate_staleness_days`
 * with w4 = 0.05. Taken literally, a 30-day-old rate contributes -1.5 against
 * a value term bounded at +0.55, so staleness alone would decide every
 * ranking. All four terms are therefore normalised to [0,1]; staleness is
 * min(days / 30, 1). The published weights are unchanged and still shown in
 * the deck. This is the only deviation from AI.md section 2 and it is
 * deliberate.
 *
 * Ranking is explainable by design (AI.md section 2): every field that fed the
 * score is returned alongside it, so S5 can show the collector why, and they
 * can re-sort by pure value or pure distance.
 */
export function rankRecyclers({
  lot,
  recyclers,
  rates,
  from,
  asOf,
  weights = RANKING_WEIGHTS,
  sortBy = "score",
}) {
  const asOfMs = new Date(asOf).getTime();
  const rateFor = new Map();
  for (const r of rates) {
    if (r.categoryCode === lot.categoryCode) rateFor.set(r.recyclerId, r);
  }

  // Hard eligibility gate, applied before any scoring (AI.md section 2).
  const eligible = [];
  for (const rec of recyclers) {
    if (rec.authorizationStatus !== "VALID") continue;
    if (!(rec.materialsAccepted || []).includes(lot.categoryCode)) continue;

    const rate = rateFor.get(rec.id);
    if (!rate) continue;

    const distanceKm = haversineKm(from, { lat: rec.lat, lng: rec.lng });
    // Distance is unknown when the collector has no GPS fix. Never block on it
    // (FRONTEND.md S1) — the row stays, and the service-area gate is skipped.
    if (distanceKm !== null && distanceKm > rec.serviceAreaKm) continue;

    eligible.push({
      recyclerId: rec.id,
      name: rec.name,
      unit: rate.unit,
      unitPrice: Number(rate.price),
      rateValidFrom: rate.validFrom,
      value: estimateValue({
        quantity: lot.quantity,
        unitPrice: rate.price,
        condition: lot.condition,
      }),
      distanceKm,
      stalenessDays: Math.max(
        0,
        Math.floor((asOfMs - new Date(rate.validFrom).getTime()) / DAY_MS),
      ),
      pickupAvailable: Boolean(rec.pickupAvailable),
    });
  }

  if (eligible.length === 0) return [];

  const nValue = normalise(eligible.map((e) => e.value), 0);
  // A missing distance sits mid-field: neither rewarded nor punished for it.
  const nDist = normalise(eligible.map((e) => e.distanceKm), 0.5);
  const nStale = eligible.map((e) => Math.min(e.stalenessDays / STALENESS_NORM_DAYS, 1));

  const scored = eligible.map((e, i) => ({
    ...e,
    score:
      weights.value * nValue[i] -
      weights.distance * nDist[i] +
      weights.pickup * (e.pickupAvailable ? 1 : 0) -
      weights.staleness * nStale[i],
    recommended: false,
  }));

  const comparators = {
    score: (a, b) => b.score - a.score,
    value: (a, b) => b.value - a.value,
    distance: (a, b) =>
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
  };
  scored.sort(comparators[sortBy] ?? comparators.score);

  // Exactly one recommendation, and only on the default sort. When the
  // collector has asked for pure value or pure distance, the list is their
  // ordering and the app must not overlay its own opinion on it.
  if (sortBy === "score") scored[0].recommended = true;
  return scored;
}
