import { CONDITIONS } from "./constants.js";

// DB.md section 3.5 seeds these into the condition_factor table. They are a
// STATED ASSUMPTION, not a measurement — the first field visit replaces them.
// Kept here as well so the phone can compute an estimate offline without a
// round trip, and the two must agree.
const CONDITION_FACTORS = { GOOD: 1.0, FAIR: 0.85, POOR: 0.7 };

/**
 * Round half away from zero at 2 decimals, avoiding the binary-float artefact
 * that makes Math.round(1.005 * 100) come out at 100 rather than 101.
 */
export function round2(n) {
  return Number((Math.round(Number((n * 100).toPrecision(15))) / 100).toFixed(2));
}

export function conditionFactorFor(condition) {
  if (!CONDITIONS.includes(condition)) {
    throw new Error(`unknown condition: ${condition}`);
  }
  return CONDITION_FACTORS[condition];
}

/**
 * The collector-facing estimate. This is the FIRST of the three prices
 * (DB.md section 5) and is stored on lot.estimated_value.
 */
export function estimateValue({ quantity, unitPrice, condition }) {
  if (!(Number(quantity) > 0)) {
    throw new Error(`quantity must be greater than zero, got ${quantity}`);
  }
  if (!(Number(unitPrice) >= 0)) {
    throw new Error(`price must be zero or greater, got ${unitPrice}`);
  }
  return round2(Number(quantity) * Number(unitPrice) * conditionFactorFor(condition));
}
