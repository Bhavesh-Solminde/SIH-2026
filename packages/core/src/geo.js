const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg) => (deg * Math.PI) / 180;

function isPoint(p) {
  return (
    p != null &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

/**
 * Great-circle distance in kilometres.
 *
 * Returns null — never 0 — when either point lacks coordinates. GPS is
 * genuinely unavailable sometimes (DB.md section 2 makes lat/lng nullable),
 * and a zero would rank an unlocatable recycler first.
 */
export function haversineKm(a, b) {
  if (!isPoint(a) || !isPoint(b)) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Speed implied by the two geotags and two timestamps a record carries.
 * Detector D7 thresholds this at 80 km/h.
 *
 * The 0.01-hour floor mirrors the GREATEST(..., 0.01) in the SERVER.md
 * section 10 query, so the JavaScript and SQL forms of D7 agree.
 */
export function impliedKmph({ from, to, fromTs, toTs }) {
  const km = haversineKm(from, to);
  if (km === null) return null;
  const hours = (new Date(toTs).getTime() - new Date(fromTs).getTime()) / 3_600_000;
  if (!Number.isFinite(hours)) return null;
  return km / Math.max(hours, 0.01);
}
