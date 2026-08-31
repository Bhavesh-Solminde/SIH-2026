// Controlled vocabularies. These mirror the CHECK constraints in DB.md exactly.
// DB.md is authoritative: if a value here is not in the matching CHECK, the
// write will be rejected by Postgres, which is the behaviour we want.

export const CATEGORY_CODES = [
  "CABLE",
  "PCB",
  "PANEL",
  "CRT",
  "BATTERY",
  "MOTOR",
  "PLASTIC",
  "OTHER",
];

export const UNITS = ["KG", "PIECE"];
export const CONDITIONS = ["GOOD", "FAIR", "POOR"];
export const SOURCE_TYPES = [
  "HOUSEHOLD",
  "SHOP",
  "OFFICE",
  "INSTITUTIONAL",
  "STREET",
  "OTHER",
];
export const LOT_STATUS = ["DRAFT", "ACCEPTED", "HANDED_OVER", "CANCELLED"];
export const HANDOVER_STATUS = ["PENDING_COLLECTOR", "CONFIRMED", "DISPUTED"];
export const AUTH_STATUS = ["VALID", "LAPSED_IN_LIST"];
export const RATE_SOURCES = ["RECYCLER_PUBLISHED", "FIELD_COLLECTED", "MARKET_INDICATIVE"];
export const RECYCLER_TYPES = ["RECYCLER", "DISMANTLER"];
export const RECYCLER_RESPONSES = ["NONE", "ACKNOWLEDGED", "DECLINED"];
export const SEVERITIES = ["INFO", "WARN", "CRITICAL"];
export const LANGUAGES = ["mr", "hi"];

// AI-ANOMALY-SPEC section 3.2. Fixed list, never free text — this is what makes
// "this recycler chose POOR_CONDITION on 14 of 15 cuts" expressible in plain SQL.
export const DOWNGRADE_REASON_CODES = [
  "POOR_CONDITION",
  "MIXED_GRADE",
  "LOW_RECOVERABLE",
  "TRANSPORT_DISTANCE",
  "BULK_DISCOUNT",
  "LOCAL_RATE_LOWER",
  "OTHER",
];

// AI.md section 2. Shown in the deck as-is.
export const RANKING_WEIGHTS = {
  value: 0.55,
  distance: 0.3,
  pickup: 0.1,
  staleness: 0.05,
};

// Staleness is normalised over this window before the weight is applied.
// See the note in ranking.js.
export const STALENESS_NORM_DAYS = 30;
