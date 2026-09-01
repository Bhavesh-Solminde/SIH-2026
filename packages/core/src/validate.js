import {
  UNITS,
  CONDITIONS,
  SOURCE_TYPES,
  LOT_STATUS,
  HANDOVER_STATUS,
  DOWNGRADE_REASON_CODES,
} from "./constants.js";

// AI-ANOMALY-SPEC section 6, write-time validation: unit matches the allowed
// set, quantity within absolute sanity bounds, a CONFIRMED handover carries
// both signatures. These run on the device before the outbox write and again
// on the server before the upsert — the same code, so the two cannot disagree.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
const MAX_QUANTITY = 5000;

const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);
const isTs = (v) => typeof v === "string" && Number.isFinite(new Date(v).getTime());
const oneOf = (v, list) => list.includes(v);

function checkQuantity(errs, field, value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    errs.push(`${field} must be greater than zero`);
    return;
  }
  if (n > MAX_QUANTITY) {
    errs.push(`${field} ${n} is outside the sanity bound of ${MAX_QUANTITY}`);
  }
  if (unit === "PIECE" && !Number.isInteger(n)) {
    errs.push(`${field} must be a whole number when unit is PIECE`);
  }
}

function money(errs, field, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) errs.push(`${field} must be zero or greater`);
}

const validators = {
  lot(p, errs) {
    if (!isUuid(p.id)) errs.push("id must be a uuid");
    if (!isUuid(p.collector_id)) errs.push("collector_id must be a uuid");
    if (!isUuid(p.category_id)) errs.push("category_id must be a uuid");
    if (!oneOf(p.unit, UNITS)) errs.push(`unit must be one of ${UNITS.join(", ")}`);
    checkQuantity(errs, "quantity", p.quantity, p.unit);
    if (!oneOf(p.condition, CONDITIONS)) {
      errs.push(`condition must be one of ${CONDITIONS.join(", ")}`);
    }
    if (p.source_type != null && !oneOf(p.source_type, SOURCE_TYPES)) {
      errs.push(`source_type must be one of ${SOURCE_TYPES.join(", ")}`);
    }
    money(errs, "estimated_value", p.estimated_value);
    if (!isTs(p.collection_ts)) errs.push("collection_ts must be an ISO-8601 timestamp");
    if (!oneOf(p.status, LOT_STATUS)) {
      errs.push(`status must be one of ${LOT_STATUS.join(", ")}`);
    }
    if (typeof p.device_id !== "string" || p.device_id.length === 0) {
      errs.push("device_id must be a non-empty string");
    }
  },

  acceptance(p, errs) {
    if (!isUuid(p.id)) errs.push("id must be a uuid");
    if (!isUuid(p.lot_id)) errs.push("lot_id must be a uuid");
    if (!isUuid(p.recycler_id)) errs.push("recycler_id must be a uuid");
    money(errs, "accepted_rate", p.accepted_rate);
    if (!oneOf(p.accepted_unit, UNITS)) {
      errs.push(`accepted_unit must be one of ${UNITS.join(", ")}`);
    }
    if (!isTs(p.accepted_ts)) errs.push("accepted_ts must be an ISO-8601 timestamp");
  },

  handover(p, errs) {
    if (!isUuid(p.id)) errs.push("id must be a uuid");
    if (!isUuid(p.lot_id)) errs.push("lot_id must be a uuid");
    if (!isUuid(p.recycler_id)) errs.push("recycler_id must be a uuid");
    if (typeof p.reference_code !== "string" || !REF_RE.test(p.reference_code)) {
      errs.push("reference_code must be an 8-character Crockford base-32 string");
    }
    checkQuantity(errs, "inspected_quantity", p.inspected_quantity, null);
    money(errs, "final_unit_price", p.final_unit_price);
    money(errs, "final_total", p.final_total);
    if (!isTs(p.handover_ts)) errs.push("handover_ts must be an ISO-8601 timestamp");
    if (!oneOf(p.status, HANDOVER_STATUS)) {
      errs.push(`status must be one of ${HANDOVER_STATUS.join(", ")}`);
    }
    if (p.inspected_condition != null && !oneOf(p.inspected_condition, CONDITIONS)) {
      errs.push(`inspected_condition must be one of ${CONDITIONS.join(", ")}`);
    }
    if (p.downgrade_reason_code != null && !oneOf(p.downgrade_reason_code, DOWNGRADE_REASON_CODES)) {
      errs.push(`downgrade_reason_code must be one of ${DOWNGRADE_REASON_CODES.join(", ")}`);
    }
    // Mirrors handover_confirmed_needs_both_signatures. Checked here too so a
    // device gets a readable reason rather than a Postgres constraint name.
    if (p.status === "CONFIRMED" && !(p.recycler_confirmed_at && p.collector_confirmed_at)) {
      errs.push("a CONFIRMED handover needs both confirmation timestamps");
    }
  },

  photo(p, errs) {
    if (!isUuid(p.id)) errs.push("id must be a uuid");
    if (!isUuid(p.lot_id)) errs.push("lot_id must be a uuid");
    if (!oneOf(p.kind, ["LOT", "HANDOVER"])) errs.push("kind must be one of LOT, HANDOVER");
    if (typeof p.sha256 !== "string" || p.sha256.length !== 64) {
      errs.push("sha256 must be a 64-character hex digest");
    }
    if (!Number.isInteger(p.bytes) || p.bytes <= 0) errs.push("bytes must be a positive integer");
  },

  collector(p, errs) {
    if (!isUuid(p.id)) errs.push("id must be a uuid");
    if (!oneOf(p.preferred_language, ["mr", "hi"])) {
      errs.push("preferred_language must be one of mr, hi");
    }
  },
};

export function validateRecord(type, payload) {
  const errs = [];
  const fn = validators[type];
  if (!fn) {
    errs.push(`unknown record type: ${type}`);
    return errs;
  }
  fn(payload ?? {}, errs);
  return errs;
}
