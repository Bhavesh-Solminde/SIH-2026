import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";

export const handoverRouter = Router();

// Condition factors — DB.md 3.5 / condition_factor table
const CONDITION_FACTOR = { GOOD: 1.0, FAIR: 0.85, POOR: 0.7 };

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

    if (!lot_id || !inspected_condition) {
      return res
        .status(400)
        .json({ error: "lot_id_and_inspected_condition_required" });
    }

    const VALID_CONDITIONS = new Set(["GOOD", "FAIR", "POOR"]);
    if (!VALID_CONDITIONS.has(inspected_condition)) {
      return res
        .status(400)
        .json({ error: "invalid_inspected_condition", detail: inspected_condition });
    }

    // 1. Lot must exist
    const lot = await prisma.lot.findUnique({ where: { id: lot_id } });
    if (!lot) {
      return res.status(404).json({ error: "lot_not_found" });
    }

    // 2. This recycler must have an ACKNOWLEDGED acceptance for this lot
    const acceptance = await prisma.acceptance.findFirst({
      where: {
        lotId: lot_id,
        recyclerId: req.recycler.id,
        recyclerResponse: "ACKNOWLEDGED",
      },
    });
    if (!acceptance) {
      return res
        .status(403)
        .json({ error: "no_acknowledged_acceptance" });
    }

    // 3. Idempotency — one lot, one handover (UNIQUE constraint on lot_id)
    const existing = await prisma.handover.findUnique({
      where: { lotId: lot_id },
    });
    if (existing) {
      return res.status(409).json({
        error: "handover_already_exists",
        handover_id: existing.id,
        lot_id: existing.lotId,
        inspected_condition: existing.inspectedCondition,
        completed_at: existing.recyclerConfirmedAt,
      });
    }

    // 4. Derive pricing from the frozen accepted_rate × quantity × condition_factor
    //    accepted_rate is numeric(12,2) — safe to use Number() at API boundary
    const rate = Number(acceptance.acceptedRate);
    const quantity = Number(lot.quantity);
    const factor = CONDITION_FACTOR[inspected_condition] ?? 1.0;
    const finalUnitPrice = +(rate * factor).toFixed(2);
    const finalTotal = +(finalUnitPrice * quantity).toFixed(2);

    const now = new Date();
    const id = uuidv7();
    const referenceCode = referenceCodeFromUuid(lot_id);

    const handover = await prisma.handover.create({
      data: {
        id,
        lotId: lot_id,
        recyclerId: req.recycler.id,
        referenceCode,
        inspectedQuantity: quantity,
        finalUnitPrice,
        finalTotal,
        inspectedCondition: inspected_condition,
        downgradeReasonCode: downgrade_reason_code ?? null,
        handoverTs: now,
        recyclerConfirmedAt: now,
        status: "PENDING_COLLECTOR",
      },
    });

    return res.status(200).json({
      handover_id: handover.id,
      lot_id: handover.lotId,
      inspected_condition: handover.inspectedCondition,
      completed_at: handover.recyclerConfirmedAt,
    });
  } catch (err) {
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
      },
    });

    // final_price = final_total from the handover row (already computed at POST /handover)
    const final_price = Number(updated.finalTotal);

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
