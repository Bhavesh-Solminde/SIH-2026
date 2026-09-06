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
 * Scoring — AI.md section 2, and the formula shown in the deck:
 *
 *   score = w_value     * normValue
 *         - w_distance  * normDistance
 *         + w_pickup    * (pickupAvailable ? 1 : 0)
 *         - w_staleness * normStaleness
 *
 * value and distance are min-max normalised across the eligible candidates, so
 * the weights are comparable. When every candidate ties on a term, that term
 * carries no information and collapses to 0 for all of them.
 *
 * The dominant term is what the collector is PAID. That is the whole point:
 * FLOW.md promises that a recycler six kilometres further away paying forty
 * rupees more per kilo is often the better trip, and this is the calculation
 * that makes that trade visible. Scoring on anything else — including how
 * closely a rate matches what the collector expected — inverts the promise,
 * because a recycler is then penalised for paying MORE than expected.
 *
 * Hard eligibility gates (applied before scoring):
 *   1. authorizationStatus === "VALID"
 *   2. materialsAccepted includes the lot's categoryCode
 *   3. Rate must exist for the category
 *   4. Distance <= serviceAreaKm (skipped when GPS unavailable)
 *
 * @param {object} params
 * @param {object} params.lot       - { categoryCode, quantity, unit, condition }
 * @param {Array}  params.recyclers - rows with lat, lng, authorizationStatus,
 *                                    materialsAccepted, serviceAreaKm, pickupAvailable
 * @param {Array}  params.rates     - rows with recyclerId, categoryCode, price, unit, validFrom
 * @param {object} params.from      - { lat, lng } collector GPS, or null
 * @param {string} params.asOf      - ISO date string (now)
 * @param {object} [params.weights] - override RANKING_WEIGHTS
 * @param {string} [params.sortBy]  - "score" | "value" | "distance"
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
    const value = qty * unitPrice * conditionFactor;

    const stalenessDays = Math.max(
      0,
      Math.floor((asOfMs - new Date(rate.validFrom).getTime()) / DAY_MS),
    );

    eligible.push({
      recyclerId:          rec.id,
      name:                rec.name,
      // Carried through so the app can offer directions once a recycler is
      // chosen: picking a yard 9 km away is useless if the collector is then
      // left to find it themselves.
      lat:                 rec.lat ?? null,
      lng:                 rec.lng ?? null,
      address:             rec.address ?? null,
      unit:                rate.unit,
      unitPrice,
      value,
      rateValidFrom:       rate.validFrom,
      distanceKm,
      stalenessDays,
      pickupAvailable:     rec.pickupAvailable === true,
      authorizationStatus: rec.authorizationStatus,
      materialsAccepted:   rec.materialsAccepted ?? [],
      recommended:         false,
    });
  }

  if (eligible.length === 0) return [];

  // ── Normalise value and distance across the candidates ────────────────
  const nValue = normalise(eligible.map((e) => e.value), 0);
  const nDist  = normalise(eligible.map((e) => e.distanceKm), 0.5);
  const nStale = eligible.map((e) => Math.min(e.stalenessDays / STALENESS_NORM_DAYS, 1));

  const scored = eligible.map((e, i) => ({
    ...e,
    score:
      weights.value     * nValue[i] -
      weights.distance  * nDist[i] +
      weights.pickup    * (e.pickupAvailable ? 1 : 0) -
      weights.staleness * nStale[i],
  }));

  const comparators = {
    score:    (a, b) => b.score - a.score,
    value:    (a, b) => b.value - a.value,
    distance: (a, b) =>
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
  };
  scored.sort(comparators[sortBy] ?? comparators.score);

  if (sortBy === "score") scored[0].recommended = true;
  return scored;
}
