// One shared builder turning an anomaly_flag's `detail` JSON into the
// plain-language sentence AI-ANOMALY-SPEC.md §2 gap 3 requires: "the rule
// that fired names the reason. Rules explain, scores rank." Used by the
// admin queue, the admin flag detail view, and the recycler's own /flags
// page, so all three describe the same flag the same way.
//
// Copy discipline per AI.md §11 — never say "AI detects fraud" or "the
// anomaly score is a probability of fraud". A flag ranks a transaction or a
// party for human review; it is not a finding of wrongdoing.

function pct(n) {
  return Number.isFinite(n) ? `${Math.round(n)}%` : "an unknown amount";
}

function rupees(n) {
  return Number.isFinite(n) ? `₹${Math.round(n)}` : "an unrecorded price";
}

export function flagSentence(flag) {
  const d = flag?.detail ?? {};
  switch (flag?.detectorCode ?? flag?.detector_code) {
    case "ML_PRICE_ANOMALY": {
      const finalPrice = rupees(d.final_price_per_kg);
      const reference = rupees(d.reference_price);
      const deviation = d.features?.abs_price_deviation_pct;
      const belowAbove = (d.features?.price_deviation_pct ?? 0) < 0 ? "below" : "above";
      const refNote = d.reference_price_status === "BUYER_FALLBACK"
        ? " (this recycler's own accepted rate — no independent reference was available)"
        : d.reference_price_status === "MARKET_MEDIAN"
          ? " (median of other recyclers' published rates)"
          : "";
      return `Paid ${finalPrice}/kg against a ${reference}/kg reference${refNote} — `
        + `${pct(deviation)} ${belowAbove}, on a buyer offer of ${rupees(d.buyer_offer_per_kg)}/kg.`;
    }
    case "ML_FLAG_RATE": {
      const rate = pct((d.rate ?? 0) * 100);
      const threshold = pct((d.threshold ?? 0) * 100);
      return `${d.flagged} of this party's last ${d.total} scored transactions were flagged `
        + `by the price model (${rate}, over the ${threshold} line).`;
    }
    default:
      return `${flag?.detectorCode ?? flag?.detector_code ?? "Unknown detector"} raised a flag — see the numbers below.`;
  }
}
