/**
 * Getting the collector to the yard they just chose.
 *
 * The ranking's whole promise is that a recycler 9 km away paying more is worth
 * the trip. That promise is empty if, having chosen one, the collector is left
 * to find it themselves — so this is the step that closes the journey.
 *
 * Two affordances, because they fail in different situations:
 *   directions — needs a maps app and (for routing) a network
 *   share      — needs neither; the address and coordinates travel over
 *                WhatsApp, which is what this trade already runs on
 *
 * URL building is kept here, free of react-native imports, so the format can be
 * tested without a device.
 */

/** Google Maps universal link — works in the app and any browser. */
export function webDirectionsUrl({ lat, lng }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * Platform-native geo intent, which opens the user's default maps app rather
 * than forcing a browser. Android honours the label in parentheses; iOS wants
 * its own scheme.
 */
export function nativeDirectionsUrl({ lat, lng, name }, platform) {
  const label = encodeURIComponent(name ?? "");
  return platform === "ios"
    ? `maps://?daddr=${lat},${lng}&q=${label}`
    : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
}

/** Plain text for the share sheet. Readable if the maps link is never tapped. */
export function shareMessage({ name, address, lat, lng }) {
  return [
    name,
    address || null,
    `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    webDirectionsUrl({ lat, lng }),
  ]
    .filter(Boolean)
    .join("\n");
}

/** A recycler without coordinates cannot be navigated to — hide the buttons. */
export function hasLocation(r) {
  return (
    r != null &&
    Number.isFinite(Number(r.lat)) &&
    Number.isFinite(Number(r.lng)) &&
    !(Number(r.lat) === 0 && Number(r.lng) === 0)
  );
}
