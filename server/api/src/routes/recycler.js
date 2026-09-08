import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { log } from "../lib/logger.js";
import { referenceCodeFromUuid } from "@bhaav/core/ids";
import { callPredict } from "../lib/aiml.js";
import { refreshEntityFlagRate } from "../lib/entityAnomaly.js";
import { flagSentence } from "../lib/flagSentence.js";
import { respondToAcceptance } from "../lib/acceptanceResponse.js";

export const recyclerRouter = Router();

// All /recycler/* routes require a session
recyclerRouter.use(requireSession);

// An admin account has a session but no recycler (req.recycler is null —
// see middleware/requireSession.js). Every handler below reads
// req.recycler.id unconditionally, which crashed with a 500 the first time
// an admin session hit one of these routes instead of an admin-only one.
// This is the only place that needs to know about it: a clean 403 here
// means no individual handler has to null-check.
recyclerRouter.use((req, res, next) => {
  if (!req.recycler) {
    log.auth.warn("recycler route hit by a non-recycler account", { path: req.path, role: req.actor?.role });
    return res.status(403).json({ error: "recycler_account_required" });
  }
  return next();
});

// GET /recycler/rates — current published rates for the logged-in recycler
recyclerRouter.get("/rates", async (req, res, next) => {
  try {
    // All top-level categories (parentId IS NULL)
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameEn: true, nameMr: true, defaultUnit: true },
    });

    // Latest rate per category for this recycler (keyed by categoryId)
    const latestRates = await prisma.rate.findMany({
      where: { recyclerId: req.recycler.id },
      orderBy: { validFrom: "desc" },
    });

    // Build a map: categoryId → latest rate
    const rateMap = {};
    for (const r of latestRates) {
      if (!rateMap[r.categoryId]) rateMap[r.categoryId] = r;
    }

    const now = Date.now();
    const rates = categories.map((c) => {
      const r = rateMap[c.id] ?? null;
      const ageDays = r
        ? Math.floor((now - new Date(r.validFrom).getTime()) / 86_400_000)
        : null;
      return {
        categoryCode: c.code,
        nameEn: c.nameEn,
        nameMr: c.nameMr,
        defaultUnit: c.defaultUnit,
        unit: r?.unit ?? c.defaultUnit,
        price: r ? Number(r.price) : null,
        validFrom: r?.validFrom ?? null,
        lastUpdatedDays: ageDays,
        stale: ageDays !== null && ageDays > 7,
      };
    });

    log.recycler.info("rates fetched", { recycler: req.recycler.name, count: rates.length });
    return res.json({ rates });
  } catch (err) {
    log.recycler.error("GET /rates error", err);
    return next(err);
  }
});

// POST /recycler/rates — append new rate rows (never overwrites)
// Body: array of { categoryCode, unit, price }
recyclerRouter.post("/rates", async (req, res, next) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    if (items.length === 0) {
      return res.status(400).json({ error: "body_must_be_non_empty_array" });
    }

    // Resolve category codes to ids in one query
    const codes = [...new Set(items.map((i) => i.categoryCode))];
    const categories = await prisma.category.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const codeToId = Object.fromEntries(categories.map((c) => [c.code, c.id]));

    const unknown = codes.filter((c) => !codeToId[c]);
    if (unknown.length > 0) {
      return res
        .status(400)
        .json({ error: "unknown_category_codes", detail: unknown });
    }

    // Validate each item
    const VALID_UNITS = new Set(["KG", "PIECE"]);
    for (const item of items) {
      if (!VALID_UNITS.has(item.unit)) {
        return res
          .status(400)
          .json({ error: "invalid_unit", detail: item.unit });
      }
      const p = Number(item.price);
      if (!isFinite(p) || p < 0) {
        return res
          .status(400)
          .json({ error: "invalid_price", detail: item.price });
      }
    }

    // createMany is the idiomatic append-only insert with Prisma
    const result = await prisma.rate.createMany({
      data: items.map((item) => ({
        recyclerId: req.recycler.id,
        categoryId: codeToId[item.categoryCode],
        unit: item.unit,
        price: item.price,
        source: "RECYCLER_PUBLISHED",
      })),
    });

    return res.status(201).json({ inserted: result.count });
  } catch (err) {
    return next(err);
  }
});

// GET /recycler/acceptances — pending (NONE) + ready-to-inspect (ACKNOWLEDGED)
recyclerRouter.get("/acceptances", async (req, res, next) => {
  try {
    const lotInclude = {
      include: {
        category: { select: { code: true, nameEn: true, nameMr: true } },
        collector: { select: { id: true, operatingArea: true } },
        handover:  { select: { status: true } },
      },
    };

    const [pendingRows, acknowledgedRows] = await Promise.all([
      prisma.acceptance.findMany({
        where: { recyclerId: req.recycler.id, recyclerResponse: "NONE" },
        include: { lot: lotInclude },
        orderBy: { acceptedTs: "desc" },
      }),
      prisma.acceptance.findMany({
        where: { recyclerId: req.recycler.id, recyclerResponse: "ACKNOWLEDGED" },
        include: { lot: lotInclude },
        orderBy: { acceptedTs: "desc" },
      }),
    ]);

    const mapRow = (a) => ({
      id:               a.id,
      lotId:            a.lotId,
      acceptedRate:     Number(a.acceptedRate),
      acceptedUnit:     a.acceptedUnit,
      acceptedTs:       a.acceptedTs,
      recyclerResponse: a.recyclerResponse,
      categoryCode:     a.lot.category?.code ?? null,
      quantity:         Number(a.lot.quantity),
      unit:             a.lot.unit,
      condition:        a.lot.condition,
      estimatedValue:   a.lot.estimatedValue ? Number(a.lot.estimatedValue) : null,
      collectorId:      a.lot.collector.id.slice(0, 8),
    });

    const readyToInspect = acknowledgedRows
      .filter((a) => !a.lot.handover)   // handover not yet created
      .map((a) => ({
        ...mapRow(a),
        referenceCode: referenceCodeFromUuid(a.lotId),
      }));

    return res.json({ acceptances: pendingRows.map(mapRow), readyToInspect, inactionMeans: null });
  } catch (err) {
    return next(err);
  }
});

// POST /recycler/acceptances/:id/respond — body: { action: "ACCEPT"|"REJECT" }
recyclerRouter.post("/acceptances/:id/respond", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body ?? {};
    // Normalise aliases sent by the console UI
    const canonical = action === "ACKNOWLEDGED" ? "ACCEPT"
                    : action === "DECLINED"     ? "REJECT"
                    : action;

    if (canonical !== "ACCEPT" && canonical !== "REJECT") {
      return res
        .status(400)
        .json({ error: "action_must_be_ACCEPT_or_REJECT" });
    }

    const existing = await prisma.acceptance.findUnique({
      where: { id },
      include: {
        lot: { include: { category: { select: { code: true } } } },
      },
    });
    if (!existing) {
      return res.status(404).json({ error: "not_found" });
    }
    if (existing.recyclerId !== req.recycler.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    if (existing.recyclerResponse !== "NONE") {
      return res.status(409).json({ error: "already_responded" });
    }

    // Shared with GET /lots/:reference_code (routes/lots.js) — scanning the
    // QR is the same acknowledgment as tapping Accept here, and both paths
    // must produce identical results (see lib/acceptanceResponse.js).
    const updated = await respondToAcceptance({
      acceptance: existing,
      canonical,
      recyclerName: req.recycler.name,
    });

    return res.json({
      id: updated.id,
      recycler_response: updated.recyclerResponse,
      response_ts: updated.responseTs,
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// T19 — GET /recycler/history?from=&to=&page=&limit=&format=
// Completed handovers for this recycler. CSV export when format=csv.
// Three prices: accepted_rate (what the collector saw), final_unit_price
// (what the recycler graded), and the market indicative rate at the time.
// ---------------------------------------------------------------------------
recyclerRouter.get("/history", async (req, res, next) => {
  try {
    const { from, to, format } = req.query;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const where = {
      recyclerId: req.recycler.id,
      status: { in: ["CONFIRMED", "DISPUTED"] },
      ...(from ? { handoverTs: { gte: new Date(from) } } : {}),
      ...(to ? { handoverTs: { ...(from ? { gte: new Date(from) } : {}), lte: new Date(to) } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.handover.findMany({
        where,
        include: {
          lot: {
            include: {
              category: { select: { code: true, nameEn: true } },
              acceptances: {
                where: { recyclerId: req.recycler.id, recyclerResponse: "ACKNOWLEDGED" },
                orderBy: { acceptedTs: "desc" },
                take: 1,
              },
            },
          },
        },
        orderBy: { handoverTs: "desc" },
        skip,
        take: limit,
      }),
      prisma.handover.count({ where }),
    ]);

    const data = rows.map((h) => {
      const acceptance = h.lot.acceptances[0] ?? null;
      return {
        id: h.id,
        reference_code: h.referenceCode,
        handover_ts: h.handoverTs.toISOString(),
        status: h.status,
        category_code: h.lot.category.code,
        category_name: h.lot.category.nameEn,
        collector_pseudonym: h.lot.collectorId.slice(0, 8),
        // Three prices:
        accepted_rate: acceptance ? Number(acceptance.acceptedRate) : null,
        final_unit_price: Number(h.finalUnitPrice),
        final_total: Number(h.finalTotal),
        inspected_quantity: Number(h.inspectedQuantity),
        inspected_condition: h.inspectedCondition ?? null,
        downgrade_reason_code: h.downgradeReasonCode ?? null,
        collector_protest: h.collectorProtest,
      };
    });

    // CSV export
    if (format === "csv") {
      const cols = [
        "reference_code", "handover_ts", "status", "category_code",
        "collector_pseudonym", "accepted_rate", "final_unit_price",
        "final_total", "inspected_quantity", "inspected_condition",
        "downgrade_reason_code", "collector_protest",
      ];
      const header = cols.join(",");
      const csvRows = data.map((r) =>
        cols.map((c) => {
          const v = r[c];
          if (v === null || v === undefined) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(",")
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="history-${req.recycler.id.slice(0, 8)}.csv"`,
      );
      return res.send([header, ...csvRows].join("\n"));
    }

    return res.json({
      data,
      page,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /recycler/flags/check — re-score one of this recycler's own handovers
// against the price model, using the reference/buyer/final prices already
// snapshotted onto it at handover time (see scoreHandover in routes/handover.js).
//
// Scoreable means: both prices are present and every unit involved is KG.
// Deliberately NOT gated on referencePriceStatus === "RESOLVED" — under
// normal operation the reference is the recycler-median (MARKET_MEDIAN), and
// requiring RESOLVED would 422 almost every handover, since only one of the
// twelve app categories currently has an external Metal Mandi match.
// ---------------------------------------------------------------------------
recyclerRouter.post("/flags/check", async (req, res, next) => {
  try {
    const { handover_id } = req.body ?? {};
    if (!handover_id) {
      return res.status(400).json({ error: "handover_id_required" });
    }

    const handover = await prisma.handover.findFirst({
      where: { id: handover_id, recyclerId: req.recycler.id },
      select: {
        id: true,
        referencePriceSnapshot: true,
        referencePriceUnit: true,
        referencePriceStatus: true,
        buyerOfferSnapshot: true,
        buyerOfferUnit: true,
        finalUnitPrice: true,
        inspectedCondition: true,
        lot: { select: { unit: true, collectorId: true } },
      },
    });

    if (!handover) {
      return res.status(404).json({ error: "handover_not_found" });
    }

    const prices = {
      reference_price: handover.referencePriceSnapshot === null
        ? null
        : Number(handover.referencePriceSnapshot),
      buyer_offer_per_kg: handover.buyerOfferSnapshot === null
        ? null
        : Number(handover.buyerOfferSnapshot),
      final_price_per_kg: Number(handover.finalUnitPrice),
      condition: handover.inspectedCondition,
    };

    const unitsAreKg =
      handover.referencePriceUnit === "KG" &&
      handover.buyerOfferUnit === "KG" &&
      handover.lot.unit === "KG";

    if (!unitsAreKg || prices.reference_price === null || prices.buyer_offer_per_kg === null) {
      return res.status(422).json({
        error: "handover_not_scoreable",
        reason: "reference and buyer prices must both be present, and every unit must be KG",
        handover_id,
        prices,
        reference_price_status: handover.referencePriceStatus,
        reference_price_unit: handover.referencePriceUnit,
        buyer_offer_unit: handover.buyerOfferUnit,
        lot_unit: handover.lot.unit,
      });
    }

    const result = await callPredict(prices);
    if (!result.ok) {
      return res.status(502).json({
        error: "model_unavailable",
        reason: result.reason,
        handover_id,
        prices,
      });
    }

    // A handover whose original POST /handover scoring hit a model outage
    // never got mlScoredAt set, so it was invisible to both parties' flag
    // rates (entityAnomaly.js) until now. Set it here too, on any successful
    // verdict, not only the first one.
    await prisma.handover.update({
      where: { id: handover.id },
      data: { mlScoredAt: new Date() },
    }).catch((err) => log.recycler.warn("ml-scored-at write failed", { reason: err?.message }));

    let flag = null;
    if (result.body.anomaly) {
      const severity = result.body.risk_level === "CRITICAL" ? "CRITICAL" : "WARN";
      // Re-checking an already-flagged handover must not pile up duplicate
      // flags — return the existing one instead of creating a second.
      flag = await prisma.anomalyFlag.findFirst({
        where: {
          subjectType: "HANDOVER",
          subjectId: handover.id,
          detectorCode: "ML_PRICE_ANOMALY",
        },
        orderBy: { createdAt: "desc" },
      });

      if (!flag) {
        flag = await prisma.anomalyFlag.create({
          data: {
            subjectType: "HANDOVER",
            subjectId: handover.id,
            detectorCode: "ML_PRICE_ANOMALY",
            severity,
            detail: {
              collector_id: handover.lot.collectorId,
              recycler_id: req.recycler.id,
              reference_price_status: handover.referencePriceStatus,
              ...prices,
              score: result.body.score,
              threshold: result.body.threshold,
              risk_level: result.body.risk_level,
              features: result.body.features,
            },
          },
        });
      }
    }

    // Same reasoning as scoreHandover: whether this re-check was anomalous or
    // not, both parties' flag rates need recomputing against the update above.
    await Promise.all([
      refreshEntityFlagRate("RECYCLER", req.recycler.id),
      refreshEntityFlagRate("COLLECTOR", handover.lot.collectorId),
    ]);

    return res.json({
      handover_id: handover.id,
      prices,
      model: result.body,
      flag,
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /recycler/anomaly/recheck — recompute this recycler's own flag rate on
// demand. The console's "Run detection" button uses this for the demo path
// ("force a run on stage, show what came back"); the automatic path is
// scoreHandover firing after every POST /handover, so this is a manual nudge,
// not a substitute for it.
// ---------------------------------------------------------------------------
recyclerRouter.post("/anomaly/recheck", async (req, res, next) => {
  try {
    const result = await refreshEntityFlagRate("RECYCLER", req.recycler.id);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// T21 — GET /recycler/flags
// Anomaly flags on this recycler's transactions. Plain language — only flags
// that name this recycler (subjectType RECYCLER) or their handovers/lots.
// The recycler can only see flags about their own records (SERVER.md §7).
// ---------------------------------------------------------------------------
recyclerRouter.get("/flags", async (req, res, next) => {
  try {
    // Collect all subject IDs that belong to this recycler:
    // their recycler ID, all their handover IDs, and all their lot IDs.
    const [handovers, lots] = await Promise.all([
      prisma.handover.findMany({
        where: { recyclerId: req.recycler.id },
        select: { id: true, lotId: true },
      }),
      prisma.acceptance.findMany({
        where: { recyclerId: req.recycler.id },
        select: { lotId: true },
      }),
    ]);

    const handoverIds = handovers.map((h) => h.id);
    const lotIds = [
      ...new Set([
        ...handovers.map((h) => h.lotId),
        ...lots.map((a) => a.lotId),
      ]),
    ];

    // D1 fires on roughly a third of all handovers — it is a per-handover INFO
    // signal, not a finding. AI-ANOMALY-SPEC sets an alert budget of 5%, and that
    // budget governs what a human SEES: an operator scrolling hundreds of INFO
    // rows to reach a handful of real ones stops reading the page entirely.
    //
    // Filtered here rather than by raising D1_deviation, because the INFO rows
    // are real signal that D2 and the evaluation harness both consume — they
    // belong in the data, just not in the operator's default view.
    const includeInfo = req.query.includeInfo === "1";

    const flags = await prisma.anomalyFlag.findMany({
      where: {
        resolvedAt: null,
        ...(includeInfo ? {} : { severity: { not: "INFO" } }),
        OR: [
          { subjectType: "RECYCLER", subjectId: req.recycler.id },
          { subjectType: "HANDOVER", subjectId: { in: handoverIds } },
          { subjectType: "LOT", subjectId: { in: lotIds } },
        ],
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    });

    return res.json(
      flags.map((f) => ({
        id: f.id,
        subject_type: f.subjectType,
        subject_id: f.subjectId,
        detector_code: f.detectorCode,
        severity: f.severity,
        detail: f.detail,
        sentence: flagSentence(f),
        created_at: f.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    return next(err);
  }
});
