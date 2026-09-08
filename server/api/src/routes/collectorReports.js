/**
 * A collector-initiated "something is wrong" report, filed from the app's
 * Earnings/Ledger history against a transaction that may already be
 * CONFIRMED. Deliberately separate from POST /handover/:lot_id/dispute, which
 * refuses once collectorConfirmedAt is set (see that route's comment: "a
 * later protest is a different record") — this IS that different record.
 *
 * No auth: the collector app never authenticates as anyone, the same as
 * /handover/:lot_id/confirm and /dispute.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { log } from "../lib/logger.js";
import { requireSession } from "../middleware/requireSession.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { referenceCodeFromUuid } from "@bhaav/core/ids";

export const collectorReportsRouter = Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_LENGTH = 1000;
const STATUSES = new Set(["OPEN", "REVIEWED"]);

// ---------------------------------------------------------------------------
// POST /reports/:lot_id  — Body: { reason }
// ---------------------------------------------------------------------------
collectorReportsRouter.post("/:lot_id", async (req, res, next) => {
  try {
    const { lot_id } = req.params;
    const { reason } = req.body ?? {};

    if (!UUID_PATTERN.test(lot_id)) {
      return res.status(400).json({ error: "invalid_lot_id" });
    }

    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    if (!trimmedReason) {
      return res.status(400).json({ error: "reason_required" });
    }
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      return res.status(400).json({ error: "reason_too_long", detail: MAX_REASON_LENGTH });
    }

    const handover = await prisma.handover.findUnique({
      where: { lotId: lot_id },
      select: { id: true },
    });
    if (!handover) {
      return res.status(404).json({ error: "handover_not_found" });
    }

    const report = await prisma.collectorReport.create({
      data: { handoverId: handover.id, reason: trimmedReason },
    });

    log.report.warn("collector reported a problem", {
      lot_id, handover_id: handover.id, report_id: report.id,
    });

    return res.status(201).json({
      report_id: report.id,
      handover_id: report.handoverId,
      status: report.status,
      created_at: report.createdAt,
    });
  } catch (err) {
    return next(err);
  }
});

function mapReport(r) {
  const h = r.handover;
  const lot = h?.lot;
  return {
    id: r.id,
    status: r.status,
    reason: r.reason,
    created_at: r.createdAt,
    handover_id: r.handoverId,
    reference_code: h?.referenceCode ?? (lot ? referenceCodeFromUuid(lot.id) : null),
    final_total: h?.finalTotal != null ? Number(h.finalTotal) : null,
    handover_status: h?.status ?? null,
    recycler: h?.recycler ? { id: h.recycler.id, name: h.recycler.name } : null,
    category_code: lot?.category?.code ?? null,
    quantity: lot?.quantity != null ? Number(lot.quantity) : null,
    unit: lot?.unit ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /reports?status=OPEN|REVIEWED|all — admin only. Default: OPEN.
// The read-side the schema comment on CollectorReport promised: "reachable
// via prisma.collectorReport.findMany() whenever the admin panel wants it."
// Route-level (not router-wide) auth — POST /reports/:lot_id above must stay
// reachable with no session, same as /handover/:lot_id/confirm and /dispute.
// ---------------------------------------------------------------------------
collectorReportsRouter.get("/", requireSession, requireAdmin, async (req, res, next) => {
  try {
    const statusParam = String(req.query.status ?? "OPEN").toUpperCase();
    const where = statusParam === "ALL" ? {}
      : STATUSES.has(statusParam) ? { status: statusParam }
      : null;
    if (where === null) {
      return res.status(400).json({ error: "invalid_status", detail: [...STATUSES, "all"] });
    }

    const reports = await prisma.collectorReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        handover: {
          include: {
            recycler: { select: { id: true, name: true } },
            lot: { include: { category: { select: { code: true } } } },
          },
        },
      },
    });

    return res.json({ reports: reports.map(mapReport) });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /reports/:id/resolve — admin only. Marks a report REVIEWED.
// Idempotent: resolving an already-REVIEWED report just returns it.
// ---------------------------------------------------------------------------
collectorReportsRouter.post("/:id/resolve", requireSession, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!UUID_PATTERN.test(id)) {
      return res.status(400).json({ error: "invalid_id" });
    }

    const report = await prisma.collectorReport.findUnique({ where: { id } });
    if (!report) return res.status(404).json({ error: "not_found" });

    const updated = report.status === "REVIEWED" ? report : await prisma.collectorReport.update({
      where: { id },
      data: { status: "REVIEWED" },
    });

    log.report.info("admin reviewed collector report", { report_id: id, admin: req.actor.email });
    return res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return next(err);
  }
});
