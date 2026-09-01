import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";

export const recyclerRouter = Router();

// All /recycler/* routes require a session
recyclerRouter.use(requireSession);

// GET /recycler/rates — current published rates for the logged-in recycler
recyclerRouter.get("/rates", async (req, res, next) => {
  try {
    // current_rate view: DISTINCT ON (recycler_id, category_id) ordered by
    // valid_from DESC — only RECYCLER_PUBLISHED rows
    const rows = await prisma.$queryRaw`
      SELECT cr.category_id, cr.unit, cr.price::text, cr.valid_from,
             c.code, c.name_en, c.name_mr, c.name_hi, c.default_unit
      FROM   current_rate cr
      JOIN   category c ON c.id = cr.category_id
      WHERE  cr.recycler_id = ${req.recycler.id}::uuid
      ORDER  BY c.code
    `;
    return res.json(rows);
  } catch (err) {
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

// GET /recycler/acceptances — pending acceptances (recyclerResponse = NONE)
recyclerRouter.get("/acceptances", async (req, res, next) => {
  try {
    const rows = await prisma.acceptance.findMany({
      where: {
        recyclerId: req.recycler.id,
        recyclerResponse: "NONE",
      },
      include: {
        lot: {
          include: {
            category: { select: { code: true, nameEn: true, nameMr: true } },
            collector: { select: { id: true, operatingArea: true } },
          },
        },
      },
      orderBy: { acceptedTs: "desc" },
    });

    const payload = rows.map((a) => ({
      id: a.id,
      lot_id: a.lotId,
      accepted_rate: a.acceptedRate,
      accepted_unit: a.acceptedUnit,
      accepted_ts: a.acceptedTs,
      lot: {
        quantity: a.lot.quantity,
        unit: a.lot.unit,
        condition: a.lot.condition,
        category: a.lot.category,
        // Collector is pseudonymous: expose only UUID prefix + operating area
        collector: {
          pseudonym: a.lot.collector.id.slice(0, 8),
          operating_area: a.lot.collector.operatingArea,
        },
      },
    }));

    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

// POST /recycler/acceptances/:id/respond — body: { action: "ACCEPT"|"REJECT" }
recyclerRouter.post("/acceptances/:id/respond", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body ?? {};

    if (action !== "ACCEPT" && action !== "REJECT") {
      return res
        .status(400)
        .json({ error: "action_must_be_ACCEPT_or_REJECT" });
    }

    const existing = await prisma.acceptance.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "not_found" });
    }
    if (existing.recyclerId !== req.recycler.id) {
      return res.status(403).json({ error: "forbidden" });
    }
    if (existing.recyclerResponse !== "NONE") {
      return res.status(409).json({ error: "already_responded" });
    }

    const response = action === "ACCEPT" ? "ACKNOWLEDGED" : "DECLINED";
    const updated = await prisma.acceptance.update({
      where: { id },
      data: { recyclerResponse: response, responseTs: new Date() },
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
