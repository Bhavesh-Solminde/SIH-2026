import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { callPredict } from "../lib/aiml.js";
import { runDetection } from "../lib/detectRun.js";
import { log } from "../lib/logger.js";

export const handoverRouter = Router();

// Condition factors — DB.md 3.5 / condition_factor table
const CONDITION_FACTOR = { GOOD: 1.0, FAIR: 0.85, POOR: 0.7 };

// ---------------------------------------------------------------------------
// GET /handover/pending?device_id=xxx  — no auth
//
// Returns handovers waiting for collector confirmation (PENDING_COLLECTOR)
// for lots that originated from the given device. Powers the app's Requests tab.
// ---------------------------------------------------------------------------
handoverRouter.get("/pending", async (req, res, next) => {
  try {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ error: "device_id_required" });

    const handovers = await prisma.handover.findMany({
      where: {
        status: "PENDING_COLLECTOR",
        lot: { deviceId: device_id },
      },
      include: {
        lot: {
          select: {
            quantity: true,
            unit: true,
            category: { select: { code: true, nameMr: true, nameEn: true } },
          },
        },
        recycler: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const pending = handovers.map((h) => ({
      handoverId: h.id,
      lotId: h.lotId,
      referenceCode: h.referenceCode,
      finalTotal: Number(h.finalTotal),
      inspectedCondition: h.inspectedCondition,
      categoryCode: h.lot.category?.code ?? null,
      categoryNameMr: h.lot.category?.nameMr ?? null,
      quantity: Number(h.lot.quantity),
      unit: h.lot.unit,
      recyclerName: h.recycler?.name ?? null,
      handoverTs: h.handoverTs,
    }));

    log.handover.info("GET /pending", { device_id, count: pending.length });
    return res.json({ pending });
  } catch (err) {
    log.handover.error("GET /handover/pending error", err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /handover  (requires recycler session)
//
// The recycler submits the inspected condition (and optional downgrade code).
// Creates the handover row with PENDING_COLLECTOR status; the collector
// counter-signs in the next call.
//
// `final_unit_price` is optional. When absent, the price is derived from the
// accepted rate and the condition factor, as before. When present it wins:
// the condition grade is a three-step ladder, and a yard that has physically
// weighed and sorted the material routinely lands between the steps. Refusing
// to record the number the two parties actually settled on doesn't make the
// derived number true — it just means the ledger, the anomaly score and the
// collector's confirmation screen all show a price nobody agreed to.
//
// Body: { lot_id, inspected_condition, downgrade_reason_code?, final_unit_price? }
// ---------------------------------------------------------------------------
handoverRouter.post("/", requireSession, async (req, res, next) => {
  try {
    const { lot_id, inspected_condition, downgrade_reason_code, final_unit_price } = req.body ?? {};
    log.handover.info("create handover", { lot_id, inspected_condition, final_unit_price, recycler: req.recycler.id });

    if (!lot_id || !inspected_condition) {
      log.handover.warn("missing required fields", { lot_id, inspected_condition });
      return res.status(400).json({ error: "lot_id_and_inspected_condition_required" });
    }

    const VALID_CONDITIONS = new Set(["GOOD", "FAIR", "POOR"]);
    if (!VALID_CONDITIONS.has(inspected_condition)) {
      log.handover.warn("invalid condition", { inspected_condition });
      return res.status(400).json({ error: "invalid_inspected_condition", detail: inspected_condition });
    }

    const lot = await prisma.lot.findUnique({ where: { id: lot_id } });
    if (!lot) {
      log.handover.warn("lot not found", { lot_id });
      return res.status(404).json({ error: "lot_not_found" });
    }

    const acceptance = await prisma.acceptance.findFirst({
      where: { lotId: lot_id, recyclerId: req.recycler.id, recyclerResponse: "ACKNOWLEDGED" },
    });
    if (!acceptance) {
      log.handover.warn("no acknowledged acceptance", { lot_id, recycler: req.recycler.id });
      return res.status(403).json({ error: "no_acknowledged_acceptance" });
    }

    const existing = await prisma.handover.findUnique({ where: { lotId: lot_id } });
    if (existing) {
      log.handover.warn("handover already exists", { lot_id, handover_id: existing.id });
      // Carry the whole existing handover back, not just its id. The console
      // hits this every time a recycler reloads /verify?ref=… after
      // submitting, and it needs enough to render the state the lot is
      // actually in rather than a bare error string.
      return res.status(409).json({
        error: "handover_already_exists",
        handover_id: existing.id,
        lot_id: existing.lotId,
        reference_code: existing.referenceCode,
        status: existing.status,
        inspected_condition: existing.inspectedCondition,
        final_unit_price: Number(existing.finalUnitPrice),
        final_total: Number(existing.finalTotal),
        collector_confirmed_at: existing.collectorConfirmedAt,
        completed_at: existing.recyclerConfirmedAt,
      });
    }

    const rate = Number(acceptance.acceptedRate);
    const quantity = Number(lot.quantity);
    const factor = CONDITION_FACTOR[inspected_condition] ?? 1.0;

    // Derived price is the default; an explicit one from the recycler wins.
    const derivedUnitPrice = +(rate * factor).toFixed(2);
    let finalUnitPrice = derivedUnitPrice;
    if (final_unit_price !== undefined && final_unit_price !== null && final_unit_price !== "") {
      const override = Number(final_unit_price);
      // handover_unit_price_check enforces >= 0 in the database. Rejecting
      // here means the recycler sees "that isn't a price" instead of a 500.
      if (!Number.isFinite(override) || override < 0) {
        log.handover.warn("invalid final_unit_price", { lot_id, final_unit_price });
        return res.status(400).json({ error: "invalid_final_unit_price", detail: final_unit_price });
      }
      finalUnitPrice = +override.toFixed(2);
    }
    const finalTotal = +(finalUnitPrice * quantity).toFixed(2);

    log.handover.debug("pricing", {
      rate, quantity, condition: inspected_condition, factor,
      derivedUnitPrice, finalUnitPrice, finalTotal,
      overridden: finalUnitPrice !== derivedUnitPrice,
    });

    const now = new Date();
    const id = uuidv7();
    const referenceCode = referenceCodeFromUuid(lot_id);

    const handover = await prisma.handover.create({
      data: {
        id, lotId: lot_id, recyclerId: req.recycler.id, referenceCode,
        inspectedQuantity: quantity, finalUnitPrice, finalTotal,
        inspectedCondition: inspected_condition,
        downgradeReasonCode: downgrade_reason_code ?? null,
        handoverTs: now, recyclerConfirmedAt: now, status: "PENDING_COLLECTOR",
      },
    });

    log.handover.info("handover created", { id, lot_id, finalTotal, referenceCode });

    scoreHandover({
      handoverId: id, lotId: lot_id, recyclerId: req.recycler.id, categoryId: lot.categoryId,
      buyerOffer: rate, finalPrice: finalUnitPrice, condition: inspected_condition,
    }).catch((err) => log.handover.warn("score fire-and-forget failed", err));

    return res.status(200).json({
      handover_id: handover.id,
      lot_id: handover.lotId,
      reference_code: handover.referenceCode,
      status: handover.status,
      inspected_condition: handover.inspectedCondition,
      final_unit_price: Number(handover.finalUnitPrice),
      final_total: Number(handover.finalTotal),
      completed_at: handover.recyclerConfirmedAt,
    });
  } catch (err) {
    log.handover.error("create handover error", err);
    return next(err);
  }
});

/**
 * Market reference price for a category: the median RECYCLER_PUBLISHED rate
 * (current_rate view — DB.md 3.4) among other VALID recyclers, excluding the
 * recycler in this transaction. Returns null (never throws) if the lookup
 * fails or no other VALID recycler publishes a rate for this category —
 * callers must fall back to the buyer's own rate in that case.
 */
async function marketReferencePrice(categoryId, excludeRecyclerId) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT cr.price
      FROM current_rate cr
      JOIN recycler r ON r.id = cr.recycler_id
      WHERE cr.category_id = ${categoryId}::uuid
        AND cr.recycler_id <> ${excludeRecyclerId}::uuid
        AND r.authorization_status = 'VALID'
    `;
    const prices = rows.map((r) => Number(r.price)).filter((p) => Number.isFinite(p));
    if (prices.length === 0) return null;

    prices.sort((a, b) => a - b);
    const mid = prices.length >> 1;
    const median = prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    return +median.toFixed(2);
  } catch (err) {
    log.handover.warn("market reference lookup failed", { reason: err.message });
    return null;
  }
}

/**
 * Fire-and-forget: call the Vercel ML model and persist any anomaly flag.
 * Never throws — callers must catch().
 */
async function scoreHandover({ handoverId, lotId, recyclerId, categoryId, buyerOffer, finalPrice, condition }) {
  // reference_price must be a MARKET reference, not this recycler's own
  // published rate. Sending the same value for reference_price and
  // buyer_offer_per_kg (the old behaviour) pins buyer_reference_ratio at a
  // constant 1.0 and collapses negotiation_gap_pct into abs_price_deviation_pct
  // — the deployed model ends up running on two independent signals out of
  // five instead of the four it was designed around. Falls back to the
  // buyer's own rate only when no other VALID recycler publishes a rate for
  // this category: a degraded score beats no score.
  const referencePrice = (await marketReferencePrice(categoryId, recyclerId)) ?? buyerOffer;

  const result = await callPredict({
    reference_price: referencePrice,
    buyer_offer_per_kg: buyerOffer,
    final_price_per_kg: finalPrice,
    condition,
  });

  if (!result.ok) {
    console.log(`[handover/score] fail-open: ${result.reason}`);
    return;
  }

  const { anomaly, score, risk_level, features } = result.body;
  console.log(`[handover/score] lot=${lotId} anomaly=${anomaly} score=${score} risk=${risk_level}`);

  if (anomaly) {
    // Write a WARN or CRITICAL flag depending on risk level
    const severity = risk_level === "CRITICAL" ? "CRITICAL" : "WARN";
    await prisma.anomalyFlag.create({
      data: {
        subjectType: "HANDOVER",
        subjectId: handoverId,
        detectorCode: "ML_PRICE_ANOMALY",
        severity,
        detail: {
          score,
          risk_level,
          features,
        },
      },
    }).catch((err) => console.warn("[handover/score] flag write error:", err.message));
  }
}

// ---------------------------------------------------------------------------
// GET /handover/by-lot/:lot_id  — no auth
//
// Returns the handover for a lot, or 404 if none exists yet. The console
// needs this to know, on a fresh page load, whether the lot it just looked up
// has already been inspected: without it a reload of /verify?ref=… re-offered
// the inspection form for a lot that already had a handover, and the only way
// to discover that was to submit and be told "handover_already_exists".
// ---------------------------------------------------------------------------
handoverRouter.get("/by-lot/:lot_id", async (req, res, next) => {
  try {
    const { lot_id } = req.params;
    const handover = await prisma.handover.findUnique({
      where: { lotId: lot_id },
      include: { recycler: { select: { name: true } } },
    });
    if (!handover) return res.status(404).json({ error: "handover_not_found" });

    return res.json({
      handover: {
        handover_id: handover.id,
        lot_id: handover.lotId,
        reference_code: handover.referenceCode,
        status: handover.status,
        inspected_condition: handover.inspectedCondition,
        downgrade_reason_code: handover.downgradeReasonCode,
        final_unit_price: Number(handover.finalUnitPrice),
        final_total: Number(handover.finalTotal),
        inspected_quantity: Number(handover.inspectedQuantity),
        collector_protest: handover.collectorProtest,
        recycler_confirmed_at: handover.recyclerConfirmedAt,
        collector_confirmed_at: handover.collectorConfirmedAt,
        recycler_name: handover.recycler?.name ?? null,
      },
    });
  } catch (err) {
    log.handover.error("GET /handover/by-lot error", err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /handover/:lot_id/dispute  (NO auth — the collector's own device)
//
// The other half of the counter-signature. A collector who is shown a final
// price they did not agree to previously had a disabled "coming soon" button
// and a "wrong" button wired to a local database this build never opens — so
// disagreeing did nothing at all, and the record showed only agreements. The
// price stands (the recycler computed it from the inspection), but the lot is
// marked DISPUTED with collector_protest set, which is what the flag review
// and the recycler's history export read.
//
// Body: { reason?: string }
// ---------------------------------------------------------------------------
handoverRouter.post("/:lot_id/dispute", async (req, res, next) => {
  try {
    const { lot_id } = req.params;

    const handover = await prisma.handover.findUnique({ where: { lotId: lot_id } });
    if (!handover) {
      return res.status(404).json({ error: "handover_not_found" });
    }
    // A handover the collector already counter-signed is closed. Reopening it
    // would break handover_confirmed_needs_both_signatures' meaning: the
    // signature was given, and a later protest is a different record.
    if (handover.collectorConfirmedAt !== null) {
      return res.status(409).json({ error: "already_confirmed" });
    }
    if (handover.status === "DISPUTED") {
      return res.status(200).json({
        handover_id: handover.id,
        lot_id: handover.lotId,
        status: handover.status,
        collector_protest: handover.collectorProtest,
      });
    }

    const updated = await prisma.handover.update({
      where: { id: handover.id },
      data: { status: "DISPUTED", collectorProtest: true },
    });

    log.handover.warn("collector disputed final price", {
      lot_id, handover_id: updated.id, final_total: Number(updated.finalTotal),
    });

    // A disputed price is exactly the kind of event the detectors exist to
    // notice. Same fail-open rule as the confirm path: never awaited, never
    // allowed to cost the collector their recorded protest.
    void runDetection(prisma, {}).catch((err) => {
      log.detect.warn("post-dispute detection failed", { reason: err?.message });
    });

    return res.status(200).json({
      handover_id: updated.id,
      lot_id: updated.lotId,
      status: updated.status,
      collector_protest: updated.collectorProtest,
      final_total: Number(updated.finalTotal),
    });
  } catch (err) {
    log.handover.error("dispute error", err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /handover/:lot_id/confirm  (NO auth — collector confirms on recycler's
// terminal)
//
// The collector counter-signs the two-sided handover. Sets confirmed_at and
// status = CONFIRMED, satisfying the DB check constraint.
// ---------------------------------------------------------------------------
handoverRouter.post("/:lot_id/confirm", async (req, res, next) => {
  try {
    const { lot_id } = req.params;
    const { handoverLat, handoverLng } = req.body ?? {};

    // Find the pending handover for this lot
    const handover = await prisma.handover.findUnique({
      where: { lotId: lot_id },
    });

    // 404 if not found or already confirmed
    if (!handover || handover.collectorConfirmedAt !== null) {
      return res.status(404).json({ error: "handover_not_found_or_already_confirmed" });
    }

    const now = new Date();
    const updated = await prisma.handover.update({
      where: { id: handover.id },
      data: {
        collectorConfirmedAt: now,
        status: "CONFIRMED",
        handoverLat: handoverLat != null ? Number(handoverLat) : undefined,
        handoverLng: handoverLng != null ? Number(handoverLng) : undefined,
      },
    });

    // final_price = final_total from the handover row (already computed at POST /handover)
    const final_price = Number(updated.finalTotal);

    // Detection is the entire AI/ML claim, and before this it only ran when a
    // logged-in recycler manually POSTed /detect-run — which nothing did. In a
    // deployed configuration D1-D13 therefore never fired at all.
    //
    // Fired AFTER the update has committed and deliberately NOT awaited: the
    // same fail-open rule that governs callDetect governs this. A detector
    // outage must never cost a collector their counter-signature, and a slow
    // aiml service must never add latency to the handover that both parties are
    // standing there waiting for.
    void runDetection(prisma, {}).catch((err) => {
      log.detect.warn("post-confirm detection failed", { reason: err?.message });
    });

    return res.status(200).json({
      handover_id: updated.id,
      lot_id: updated.lotId,
      confirmed_at: updated.collectorConfirmedAt,
      final_price,
    });
  } catch (err) {
    return next(err);
  }
});
