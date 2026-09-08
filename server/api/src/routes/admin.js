import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { rankFlags } from "../lib/adminQueue.js";
import { flagSentence } from "../lib/flagSentence.js";
import { scoreHandover } from "../lib/scoreHandover.js";
import { getBuyerOfferForLot } from "../lib/buyerOffer.js";
import { MIN_SAMPLE_SIZE, FLAG_RATE_THRESHOLD } from "../lib/entityAnomaly.js";
import { log } from "../lib/logger.js";

export const adminRouter = Router();

// The admin persona is the first privileged actor in this system — see
// middleware/requireSession.js and requireAdmin.js. Every route below is
// cross-tenant by design: this is the one place in the API that is allowed
// to read across every recycler and collector at once.
adminRouter.use(requireSession, requireAdmin);

const ADMIN_OUTCOMES = new Set(["JUSTIFIED", "SUSPICIOUS", "DISPUTED", "UNRESOLVED", "INVALID"]);
const SEVERITIES = new Set(["INFO", "WARN", "CRITICAL"]);

// ---------------------------------------------------------------------------
// GET /admin/summary — the header strip for the queue page.
// ---------------------------------------------------------------------------
adminRouter.get("/summary", async (req, res, next) => {
  try {
    const [bySeverity, handoversTotal, handoversScored, overLine] = await Promise.all([
      prisma.anomalyFlag.groupBy({ by: ["severity"], where: { resolvedAt: null }, _count: true }),
      prisma.handover.count(),
      prisma.handover.count({ where: { mlScoredAt: { not: null } } }),
      prisma.anomalyFlag.count({ where: { detectorCode: "ML_FLAG_RATE", resolvedAt: null } }),
    ]);

    const severityCounts = { INFO: 0, WARN: 0, CRITICAL: 0 };
    for (const row of bySeverity) severityCounts[row.severity] = row._count;

    res.json({
      open_flags_by_severity: severityCounts,
      handovers_total: handoversTotal,
      handovers_scored: handoversScored,
      handovers_unscored: handoversTotal - handoversScored,
      parties_over_flag_rate_line: overLine,
      flag_rate_threshold: FLAG_RATE_THRESHOLD,
      min_sample_size: MIN_SAMPLE_SIZE,
      model: process.env.AIML_PREDICT_URL ?? process.env.AIML_URL ?? "https://sihmodel.vercel.app",
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/flags?severity=&detector=&status=open|resolved|all&limit=
//
// The ranked queue (AI-ANOMALY-SPEC.md §3.3). Default status=open, default
// limit=20, capped at 100 — "the top 20 only" is the default view, not a
// hard ceiling for someone who deliberately asks for more.
// ---------------------------------------------------------------------------
adminRouter.get("/flags", async (req, res, next) => {
  try {
    const { severity, detector } = req.query;
    const status = req.query.status ?? "open";
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 20;

    if (severity && !SEVERITIES.has(severity)) {
      return res.status(400).json({ error: "invalid_severity", detail: severity });
    }
    if (!["open", "resolved", "all"].includes(status)) {
      return res.status(400).json({ error: "invalid_status", detail: status });
    }

    const where = {};
    if (status === "open") where.resolvedAt = null;
    else if (status === "resolved") where.resolvedAt = { not: null };
    if (severity) where.severity = severity;
    if (detector) where.detectorCode = detector;

    // Ranking needs per-party context that isn't a SQL sort key, so it runs
    // in application code (lib/adminQueue.js) over a bounded candidate batch.
    const candidates = await prisma.anomalyFlag.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    const flags = await rankFlags(candidates, { limit });
    log.admin.debug("GET /admin/flags", { status, severity, detector, candidates: candidates.length, returned: flags.length });
    res.json({ flags, candidates_considered: candidates.length, limit });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/flags/:id — one flag, fully enriched, plus sibling open flags
// on the same subject.
// ---------------------------------------------------------------------------
adminRouter.get("/flags/:id", async (req, res, next) => {
  try {
    const flag = await prisma.anomalyFlag.findUnique({ where: { id: req.params.id } });
    if (!flag) return res.status(404).json({ error: "not_found" });

    const [ranked] = await rankFlags([flag], { limit: 1 });

    const related = await prisma.anomalyFlag.findMany({
      where: {
        subjectType: flag.subjectType,
        subjectId: flag.subjectId,
        id: { not: flag.id },
        resolvedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ...ranked,
      related: related.map((f) => ({
        id: f.id,
        detector_code: f.detectorCode,
        severity: f.severity,
        sentence: flagSentence(f),
        created_at: f.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/flags/:id   body: { admin_outcome, note? }
//
// AI-ANOMALY-SPEC.md §3.4 outcome semantics — JUSTIFIED joins the next tuning
// set as a verified-normal example, SUSPICIOUS as a confirmed anomaly,
// DISPUTED/UNRESOLVED/INVALID are excluded from tuning either way. This
// build has no re-open flow: every outcome here is terminal and resolves the
// flag, which is the honest description of what's implemented, not a claim
// that the write-back loop into model tuning exists (it doesn't).
// ---------------------------------------------------------------------------
adminRouter.patch("/flags/:id", async (req, res, next) => {
  try {
    const { admin_outcome, note } = req.body ?? {};
    if (!admin_outcome || !ADMIN_OUTCOMES.has(admin_outcome)) {
      return res.status(400).json({ error: "invalid_admin_outcome", detail: admin_outcome });
    }

    const flag = await prisma.anomalyFlag.findUnique({ where: { id: req.params.id } });
    if (!flag) return res.status(404).json({ error: "not_found" });

    const detail = note ? { ...flag.detail, admin_note: String(note).slice(0, 2000) } : flag.detail;
    const updated = await prisma.anomalyFlag.update({
      where: { id: flag.id },
      data: { adminOutcome: admin_outcome, resolvedAt: new Date(), detail },
    });

    log.admin.info("flag outcome recorded", { flag_id: flag.id, admin_outcome, by: req.actor.email });
    res.json({ id: updated.id, admin_outcome: updated.adminOutcome, resolved_at: updated.resolvedAt });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/recyclers — AI-ANOMALY-SPEC.md §7.1: rank recyclers by what they
// actually paid, not by detector output. "No accusation. No detector output.
// No legal exposure."
// ---------------------------------------------------------------------------
adminRouter.get("/recyclers", async (req, res, next) => {
  try {
    const recyclers = await prisma.recycler.findMany({
      where: { authorizationStatus: "VALID" },
      select: { id: true, name: true, district: true },
    });

    // ONE query for every recycler's scored handovers, not N. A per-recycler
    // loop — even made sequential to stop it firing all N at once — still
    // ran 150+ round trips against DATABASE_URL's 5-connection pgbouncer
    // pool (see .env) and starved every other route on the API: confirmed
    // live, GET /public/authorisation timed out mid-page-load while this
    // endpoint's loop was running. Global handoverTs-desc order is preserved
    // within each recyclerId group, so slicing the first 20 per group below
    // gives each recycler exactly its 20 most recent — same result as the
    // old per-recycler `take: 20`, one query instead of 163.
    const recyclerIds = recyclers.map((r) => r.id);
    const allHandovers = recyclerIds.length === 0 ? [] : await prisma.handover.findMany({
      where: { recyclerId: { in: recyclerIds }, mlScoredAt: { not: null } },
      orderBy: { handoverTs: "desc" },
      select: {
        recyclerId: true,
        finalUnitPrice: true,
        buyerOfferSnapshot: true,
        inspectedCondition: true,
        lot: { select: { condition: true } },
      },
    });

    const handoversByRecycler = new Map();
    for (const h of allHandovers) {
      let list = handoversByRecycler.get(h.recyclerId);
      if (!list) {
        list = [];
        handoversByRecycler.set(h.recyclerId, list);
      }
      if (list.length < 20) list.push(h);
    }

    const rows = [];
    for (const r of recyclers) {
      const handovers = handoversByRecycler.get(r.id) ?? [];

      // Cold start (AI-ANOMALY-SPEC.md gap 6): never let "no data" render as
      // "looks fine" — an under-sampled recycler gets its own honest label,
      // not a blank or a zero that reads as clean.
      if (handovers.length < MIN_SAMPLE_SIZE) {
        rows.push({
          recycler_id: r.id, name: r.name, district: r.district,
          history: "insufficient", sample_size: handovers.length,
        });
        continue;
      }

      // "Published" here is each handover's OWN buyerOfferSnapshot — the
      // accepted rate for that specific transaction's category, frozen at
      // acceptance time — not a single Rate row looked up separately. A
      // recycler publishes a different rate per category (CABLE vs PCB vs
      // BATTERY...), and this sample of 20 handovers can span several of
      // them; picking "whichever Rate row has the latest validFrom" pulled
      // in a category the sample never touched and compared it against an
      // unrelated median. Comparing each handover against its own snapshot
      // is category-correct by construction, with no join required.
      const median = (nums) => {
        const sorted = nums.filter(Number.isFinite).sort((a, b) => a - b);
        if (sorted.length === 0) return null;
        const mid = sorted.length >> 1;
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      };

      const medianPaid = median(handovers.map((h) => Number(h.finalUnitPrice)));
      const medianOffered = median(handovers.map((h) => Number(h.buyerOfferSnapshot)));
      const cutCount = handovers.filter(
        (h) => Number.isFinite(Number(h.buyerOfferSnapshot)) && Number(h.finalUnitPrice) < Number(h.buyerOfferSnapshot),
      ).length;
      const downgradedCount = handovers.filter(
        (h) => h.lot?.condition && h.inspectedCondition && h.inspectedCondition !== h.lot.condition,
      ).length;

      rows.push({
        recycler_id: r.id,
        name: r.name,
        district: r.district,
        history: "ok",
        sample_size: handovers.length,
        published_rate: medianOffered != null ? +medianOffered.toFixed(2) : null,
        median_paid: medianPaid != null ? +medianPaid.toFixed(2) : null,
        price_cut_count: cutCount,
        price_cut_of: handovers.length,
        downgrade_exception_rate: +(downgradedCount / handovers.length).toFixed(4),
      });
    }

    // Worst published-vs-paid gap first; parties with insufficient history
    // sink to the bottom rather than sorting arbitrarily among themselves.
    rows.sort((a, b) => {
      const gapA = a.published_rate != null && a.median_paid != null ? a.published_rate - a.median_paid : -Infinity;
      const gapB = b.published_rate != null && b.median_paid != null ? b.published_rate - b.median_paid : -Infinity;
      return gapB - gapA;
    });

    res.json({ recyclers: rows });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/rescore   body: { handover_id? }
//
// Re-runs the exact scoring path POST /handover uses (lib/scoreHandover.js).
// With no body, backfills every handover that was never scored (a model
// outage, or — on this build — every handover created before this pipeline
// had any transactions to score at all). This is the demo's "run detection"
// button.
// ---------------------------------------------------------------------------
adminRouter.post("/rescore", async (req, res, next) => {
  try {
    const { handover_id } = req.body ?? {};
    const where = handover_id ? { id: handover_id } : { mlScoredAt: null };

    const handovers = await prisma.handover.findMany({
      where,
      take: 200,
      orderBy: { createdAt: "asc" },
      include: { lot: { include: { category: { select: { code: true } } } } },
    });

    if (handover_id && handovers.length === 0) {
      return res.status(404).json({ error: "handover_not_found" });
    }

    const results = [];
    for (const h of handovers) {
      const buyerOffer = await getBuyerOfferForLot(h.lotId, h.recyclerId);
      // eslint-disable-next-line no-await-in-loop
      const outcome = await scoreHandover({
        handoverId: h.id,
        lotId: h.lotId,
        recyclerId: h.recyclerId,
        collectorId: h.lot.collectorId,
        categoryId: h.lot.categoryId,
        categoryCode: h.lot.category?.code ?? null,
        buyerOffer: buyerOffer.status === "FOUND" ? buyerOffer.price : Number(h.buyerOfferSnapshot),
        buyerOfferUnit: buyerOffer.status === "FOUND" ? buyerOffer.unit : h.buyerOfferUnit,
        finalPrice: Number(h.finalUnitPrice),
        condition: h.inspectedCondition,
      });
      results.push({ handover_id: h.id, ...outcome });
    }

    log.admin.info("rescore run", { requested: handover_id ?? "all_unscored", count: results.length, by: req.actor.email });
    res.json({ rescored: results.length, results });
  } catch (err) {
    next(err);
  }
});
