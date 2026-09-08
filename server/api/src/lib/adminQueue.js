import { prisma } from "../db.js";
import { refreshEntityFlagRate, FLAG_RATE_THRESHOLD } from "./entityAnomaly.js";
import { flagSentence } from "./flagSentence.js";

// AI-ANOMALY-SPEC.md §3.3 — the admin queue is ranked, not chronological:
//   priority = severity_weight × value_at_stake × party_flag_rate
// "Escalate on rate, not count. 15 of 50 flagged matters, 2 of 50 is noise. A
// busy honest recycler must never be punished for volume." — which is why
// this multiplies by the party's flag RATE (entityAnomaly.js), never a raw
// flagged count.
const SEVERITY_WEIGHT = { CRITICAL: 3, WARN: 2, INFO: 1 };

// A rate we can't compute (insufficient history) must not zero the priority
// out — that would be "no data renders as looks fine", the exact failure
// mode AI-ANOMALY-SPEC.md gap 6 forbids. Floor at the threshold instead: a
// new party is treated as marginally over the line until proven otherwise,
// not as clean.
const UNKNOWN_RATE_FLOOR = FLAG_RATE_THRESHOLD;

async function valueAtStakeForHandover(flag) {
  const handover = await prisma.handover.findUnique({
    where: { id: flag.subjectId },
    select: {
      inspectedQuantity: true,
      finalTotal: true,
      referencePriceSnapshot: true,
      recyclerId: true,
      lot: { select: { collectorId: true, category: { select: { nameEn: true, code: true } } } },
    },
  });

  if (!handover) {
    // The handover was deleted or the id is stale — still render the flag,
    // just without the enrichment a live row would give.
    return { value: 1, recyclerId: flag.detail?.recycler_id ?? null, collectorId: null, category: null, quantity: null };
  }

  const ref = Number(handover.referencePriceSnapshot ?? flag.detail?.reference_price);
  const qty = Number(handover.inspectedQuantity);
  const paid = Number(handover.finalTotal);
  const value = Number.isFinite(ref) && Number.isFinite(qty) && Number.isFinite(paid)
    ? Math.max(1, Math.abs(ref * qty - paid))
    : 1;

  return {
    value,
    recyclerId: handover.recyclerId,
    collectorId: handover.lot?.collectorId ?? null,
    category: handover.lot?.category ?? null,
    quantity: Number.isFinite(qty) ? qty : null,
  };
}

// "value_at_stake ... entity: summed over that party's flagged handovers"
// (AI-ANOMALY-SPEC.md §3.3). Recomputes the same flagged/scored split
// entityAnomaly.js uses for the rate itself, so the two numbers describe the
// same population.
async function valueAtStakeForParty(subjectType, subjectId) {
  const where = subjectType === "RECYCLER"
    ? { recyclerId: subjectId }
    : { lot: { collectorId: subjectId } };

  const handovers = await prisma.handover.findMany({
    where: { ...where, mlScoredAt: { not: null } },
    select: { id: true, inspectedQuantity: true, finalTotal: true, referencePriceSnapshot: true },
  });
  if (handovers.length === 0) return 1;

  const ids = handovers.map((h) => h.id);
  const flagged = await prisma.anomalyFlag.findMany({
    where: { subjectType: "HANDOVER", subjectId: { in: ids }, detectorCode: "ML_PRICE_ANOMALY" },
    select: { subjectId: true },
  });
  const flaggedIds = new Set(flagged.map((f) => f.subjectId));

  let total = 0;
  for (const h of handovers) {
    if (!flaggedIds.has(h.id)) continue;
    const ref = Number(h.referencePriceSnapshot);
    const qty = Number(h.inspectedQuantity);
    const paid = Number(h.finalTotal);
    if (Number.isFinite(ref) && Number.isFinite(qty) && Number.isFinite(paid)) {
      total += Math.abs(ref * qty - paid);
    }
  }
  return Math.max(1, total);
}

/**
 * Enrich and rank a batch of anomaly_flag rows into the admin queue shape.
 * Ranking needs per-party value-at-stake and flag-rate, neither of which is a
 * single SQL sort key, so this runs in application code over a bounded
 * candidate set (the caller is responsible for capping how many flags it
 * passes in).
 */
export async function rankFlags(flags, { limit = 20 } = {}) {
  const rateCache = new Map(); // recyclerId -> { rate, history }

  async function recyclerRate(recyclerId) {
    if (!recyclerId) return { rate: UNKNOWN_RATE_FLOOR, history: "insufficient" };
    if (rateCache.has(recyclerId)) return rateCache.get(recyclerId);
    const result = await refreshEntityFlagRate("RECYCLER", recyclerId);
    const out = result.status === "flagged" || result.status === "clear"
      ? { rate: result.rate ?? 0, history: "ok" }
      : { rate: UNKNOWN_RATE_FLOOR, history: "insufficient" };
    rateCache.set(recyclerId, out);
    return out;
  }

  const nameCache = new Map();
  async function recyclerName(id) {
    if (!id) return null;
    if (nameCache.has(id)) return nameCache.get(id);
    const r = await prisma.recycler.findUnique({ where: { id }, select: { name: true } });
    nameCache.set(id, r?.name ?? null);
    return r?.name ?? null;
  }

  const rows = [];
  for (const flag of flags) {
    const severityWeight = SEVERITY_WEIGHT[flag.severity] ?? 1;
    let valueAtStake = 1;
    let recyclerId = null;
    let collectorId = null;
    let category = null;
    let quantity = null;

    if (flag.subjectType === "HANDOVER") {
      const ctx = await valueAtStakeForHandover(flag);
      valueAtStake = ctx.value;
      recyclerId = ctx.recyclerId;
      collectorId = ctx.collectorId;
      category = ctx.category;
      quantity = ctx.quantity;
    } else if (flag.subjectType === "RECYCLER" || flag.subjectType === "COLLECTOR") {
      valueAtStake = await valueAtStakeForParty(flag.subjectType, flag.subjectId);
      if (flag.subjectType === "RECYCLER") recyclerId = flag.subjectId;
      else collectorId = flag.subjectId;
    } else {
      // LOT / MARKET are permitted by the anomaly_flag CHECK constraint
      // (D6-D8, D13 in AI-ANOMALY-SPEC.md) but the live pipeline never
      // writes them (see AI-ANOMALY-SPEC.md's superseded note) — handled
      // defensively here so the queue never 500s if one ever appears.
      valueAtStake = Number(flag.detail?.value_at_stake) || 1;
    }

    const ratedRecyclerId = recyclerId ?? flag.detail?.recycler_id ?? null;
    const { rate: partyFlagRate, history } = await recyclerRate(ratedRecyclerId);
    const name = await recyclerName(ratedRecyclerId);

    rows.push({
      id: flag.id,
      subject_type: flag.subjectType,
      subject_id: flag.subjectId,
      detector_code: flag.detectorCode,
      severity: flag.severity,
      detail: flag.detail,
      admin_outcome: flag.adminOutcome,
      created_at: flag.createdAt,
      resolved_at: flag.resolvedAt,
      sentence: flagSentence(flag),
      recycler_id: ratedRecyclerId,
      recycler_name: name,
      collector_id: collectorId,
      category: category ? { code: category.code, name_en: category.nameEn } : null,
      quantity,
      value_at_stake: Math.round(valueAtStake),
      party_flag_rate: +partyFlagRate.toFixed(4),
      history,
      priority: +(severityWeight * valueAtStake * Math.max(partyFlagRate, 0.01)).toFixed(2),
    });
  }

  // Top N only, worst first — AI-ANOMALY-SPEC.md §3.3: "Show the top 20 only.
  // A bounded queue is the answer to 'does this scale?'; an unbounded alert
  // list is a spam folder."
  rows.sort((a, b) => b.priority - a.priority);
  return rows.slice(0, limit);
}
