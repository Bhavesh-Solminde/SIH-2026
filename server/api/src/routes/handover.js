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
// Body: { lot_id, inspected_condition, downgrade_reason_code? }
// ---------------------------------------------------------------------------
handoverRouter.post("/", requireSession, async (req, res, next) => {
  try {
    const { lot_id, inspected_condition, downgrade_reason_code } = req.body ?? {};
    log.handover.info("create handover", { lot_id, inspected_condition, recycler: req.recycler.id });

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
      return res.status(409).json({
        error: "handover_already_exists",
        handover_id: existing.id,
        lot_id: existing.lotId,
        inspected_condition: existing.inspectedCondition,
        completed_at: existing.recyclerConfirmedAt,
      });
    }

    const rate = Number(acceptance.acceptedRate);
    const quantity = Number(lot.quantity);
    const factor = CONDITION_FACTOR[inspected_condition] ?? 1.0;
    const finalUnitPrice = +(rate * factor).toFixed(2);
    const finalTotal = +(finalUnitPrice * quantity).toFixed(2);

    log.handover.debug("pricing", { rate, quantity, condition: inspected_condition, factor, finalUnitPrice, finalTotal });

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
      handoverId: id, lotId: lot_id, recyclerId: req.recycler.id,
      referencePrice: rate, buyerOffer: rate, finalPrice: finalUnitPrice,
      condition: inspected_condition,
    }).catch((err) => log.handover.warn("score fire-and-forget failed", err));

    return res.status(200).json({
      handover_id: handover.id,
      lot_id: handover.lotId,
      inspected_condition: handover.inspectedCondition,
      completed_at: handover.recyclerConfirmedAt,
    });
  } catch (err) {
    log.handover.error("create handover error", err);
    return next(err);
  }
});

/**
 * Fire-and-forget: call the Vercel ML model and persist any anomaly flag.
 * Never throws — callers must catch().
 */
async function scoreHandover({ handoverId, lotId, recyclerId, referencePrice, buyerOffer, finalPrice, condition }) {
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
