import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { getBuyerOfferForLot } from "../lib/buyerOffer.js";
import { scoreHandover } from "../lib/scoreHandover.js";
import { log } from "../lib/logger.js";

export const handoverRouter = Router();

// A malformed lot_id used to reach Prisma and come back as a 500. It is a
// client mistake, and it should read as one.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The reasons the console offers. Anything else is a client that has drifted
// from the form, and storing it would quietly corrupt the downgrade reporting.
const DOWNGRADE_REASON_CODES = new Set([
  "POOR_CONDITION",
  "MIXED_GRADE",
  "LOW_RECOVERABLE",
  "TRANSPORT_DISTANCE",
  "BULK_DISCOUNT",
  "LOCAL_RATE_LOWER",
  "OTHER",
]);

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
// The recycler submits the inspected condition, the final negotiated unit
// price, and an optional downgrade code. Creates the handover row with
// PENDING_COLLECTOR status; the collector counter-signs in the next call.
//
// `final_unit_price` is REQUIRED and comes from the recycler. The server used
// to derive it — accepted rate × a three-step condition factor — and that
// derived number was never a price anyone had agreed to. A yard that has
// weighed and sorted the material lands between those steps constantly, and
// the whole point of the handover is that the two parties settle on a figure
// and both sign it. The condition ladder survives as a *suggestion* in the
// console's form (HandoverForm.jsx), which is the right place for it: it seeds
// the input the recycler can then overwrite.
//
// Body: { lot_id, inspected_condition, final_unit_price, downgrade_reason_code? }
// ---------------------------------------------------------------------------
handoverRouter.post("/", requireSession, async (req, res, next) => {
  try {
    const { lot_id, inspected_condition, downgrade_reason_code, final_unit_price } = req.body ?? {};
    log.handover.info("create handover", { lot_id, inspected_condition, final_unit_price, recycler: req.recycler.id });

    if (!lot_id || !inspected_condition) {
      log.handover.warn("missing required fields", { lot_id, inspected_condition });
      return res.status(400).json({ error: "lot_id_and_inspected_condition_required" });
    }

    if (!UUID_PATTERN.test(lot_id)) {
      log.handover.warn("malformed lot_id", { lot_id });
      return res.status(400).json({ error: "invalid_lot_id", detail: lot_id });
    }

    const VALID_CONDITIONS = new Set(["GOOD", "FAIR", "POOR"]);
    if (!VALID_CONDITIONS.has(inspected_condition)) {
      log.handover.warn("invalid condition", { inspected_condition });
      return res.status(400).json({ error: "invalid_inspected_condition", detail: inspected_condition });
    }

    // handover_unit_price_check enforces >= 0 in the database. Rejecting here
    // means the recycler sees "that isn't a price" instead of a 500.
    const finalUnitPrice = Number(final_unit_price);
    if (final_unit_price === undefined || final_unit_price === null || final_unit_price === "") {
      log.handover.warn("missing final_unit_price", { lot_id });
      return res.status(400).json({ error: "final_unit_price_required" });
    }
    if (!Number.isFinite(finalUnitPrice) || finalUnitPrice < 0) {
      log.handover.warn("invalid final_unit_price", { lot_id, final_unit_price });
      return res.status(400).json({ error: "invalid_final_unit_price", detail: final_unit_price });
    }

    if (downgrade_reason_code != null && downgrade_reason_code !== ""
        && !DOWNGRADE_REASON_CODES.has(downgrade_reason_code)) {
      log.handover.warn("invalid downgrade reason", { lot_id, downgrade_reason_code });
      return res.status(400).json({ error: "invalid_downgrade_reason_code", detail: downgrade_reason_code });
    }

    const lot = await prisma.lot.findUnique({
      where: { id: lot_id },
      include: { category: { select: { code: true } } },
    });
    if (!lot) {
      log.handover.warn("lot not found", { lot_id });
      return res.status(404).json({ error: "lot_not_found" });
    }

    const buyerOffer = await getBuyerOfferForLot(lot_id, req.recycler.id);
    if (buyerOffer.status !== "FOUND") {
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

    const quantity = Number(lot.quantity);
    const settledUnitPrice = +finalUnitPrice.toFixed(2);
    const finalTotal = +(settledUnitPrice * quantity).toFixed(2);

    log.handover.debug("pricing", {
      buyerOffer: buyerOffer.price, quantity, condition: inspected_condition,
      finalUnitPrice: settledUnitPrice, finalTotal,
    });

    const now = new Date();
    const id = uuidv7();
    const referenceCode = referenceCodeFromUuid(lot_id);

    const handover = await prisma.handover.create({
      data: {
        id, lotId: lot_id, recyclerId: req.recycler.id, referenceCode,
        inspectedQuantity: quantity,
        finalUnitPrice: settledUnitPrice, finalTotal,
        buyerOfferSnapshot: buyerOffer.price,
        buyerOfferUnit: buyerOffer.unit,
        inspectedCondition: inspected_condition,
        downgradeReasonCode: downgrade_reason_code || null,
        handoverTs: now, recyclerConfirmedAt: now, status: "PENDING_COLLECTOR",
      },
    });

    log.handover.info("handover created", { id, lot_id, finalTotal, referenceCode });

    scoreHandover({
      handoverId: id, lotId: lot_id, recyclerId: req.recycler.id, collectorId: lot.collectorId,
      categoryId: lot.categoryId, categoryCode: lot.category?.code ?? null,
      buyerOffer: buyerOffer.price, buyerOfferUnit: buyerOffer.unit,
      finalPrice: settledUnitPrice, condition: inspected_condition,
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

// marketReferencePrice, resolveReferencePrice and scoreHandover moved to
// ../lib/scoreHandover.js (2026-09-07) so the admin rescore endpoint can
// call the exact same scoring path this route uses.

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

    // No detection to trigger here: the model already scored this handover
    // at POST /handover (scoreHandover), and a dispute changes neither the
    // price the model saw nor either party's flag rate.
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
//
// Requires a second, independent photo + GPS fix taken at THIS moment (see
// client/app/src/screens/HandoverEvidenceScreen.jsx) — the lot's original
// collection photo/location (CameraScreen, taken at pickup) describes a
// different event and cannot stand in for it. Both are enforced here rather
// than trusted from the client: handoverLat/Lng and an uploaded HANDOVER
// photo must exist before the handover can move to CONFIRMED.
// ---------------------------------------------------------------------------
handoverRouter.post("/:lot_id/confirm", async (req, res, next) => {
  try {
    const { lot_id } = req.params;
    const { handoverLat, handoverLng } = req.body ?? {};

    // Find the pending handover for this lot. A lot_id that matches nothing
    // (or an already-confirmed handover) is a 404 regardless of what else is
    // wrong with the request — checked before the evidence requirements below
    // so those two failure modes never compete for the same request.
    const handover = await prisma.handover.findUnique({
      where: { lotId: lot_id },
    });
    if (!handover || handover.collectorConfirmedAt !== null) {
      return res.status(404).json({ error: "handover_not_found_or_already_confirmed" });
    }

    const lat = handoverLat != null ? Number(handoverLat) : null;
    const lng = handoverLng != null ? Number(handoverLng) : null;
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "handover_location_required" });
    }

    const evidencePhoto = await prisma.photo.findFirst({
      where: { lotId: lot_id, kind: "HANDOVER", uploadedAt: { not: null } },
      select: { id: true },
    });
    if (!evidencePhoto) {
      return res.status(400).json({ error: "handover_photo_required" });
    }

    const now = new Date();
    const updated = await prisma.handover.update({
      where: { id: handover.id },
      data: {
        collectorConfirmedAt: now,
        status: "CONFIRMED",
        handoverLat: lat,
        handoverLng: lng,
      },
    });

    // final_price = final_total from the handover row (already computed at POST /handover)
    const final_price = Number(updated.finalTotal);

    // No detection to trigger here either, for the same reason as the
    // dispute path above — the model already scored this handover at
    // POST /handover.
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
