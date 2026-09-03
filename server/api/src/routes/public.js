/**
 * Public rates endpoint — no session required.
 * Used by the collector app to fetch recycler rates + full recycler profile
 * needed for local ranking: lat, lng, materialsAccepted, authorizationStatus.
 *
 * GET /public/rates?category=BATTERY
 * GET /public/rates          → all categories
 *
 * Response shape per item:
 *   { recyclerId, recyclerName, lat, lng, authorizationStatus,
 *     materialsAccepted, serviceAreaKm,
 *     categoryCode, categoryNameEn, categoryNameMr,
 *     price, unit, validFrom }
 */

import { Router } from "express";
import { prisma } from "../db.js";
import { log } from "../lib/logger.js";
import { uuidv7 } from "@bhaav/core/ids";

export const publicRouter = Router();

publicRouter.get("/rates", async (req, res, next) => {
  try {
    const { category } = req.query;

    const categoryFilter = category
      ? { code: category.toUpperCase() }
      : { parentId: null };

    const categories = await prisma.category.findMany({
      where: categoryFilter,
      select: { id: true, code: true, nameEn: true, nameMr: true, defaultUnit: true },
    });

    if (categories.length === 0) return res.json({ rates: [] });

    const categoryIds = categories.map((c) => c.id);
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

    // Latest published rate per (recycler × category)
    const rawRates = await prisma.rate.findMany({
      where: {
        categoryId: { in: categoryIds },
        recycler: { authorizationStatus: "VALID" }, // only authorized recyclers
      },
      orderBy: { validFrom: "desc" },
      include: {
        recycler: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
            authorizationStatus: true,
            materialsAccepted: true,
            serviceAreaKm: true,
          },
        },
      },
    });

    // De-duplicate: keep only the latest rate per (recyclerId, categoryId)
    const seen = new Set();
    const deduped = [];
    for (const r of rawRates) {
      const key = `${r.recyclerId}::${r.categoryId}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(r);
      }
    }

    const rates = deduped.map((r) => ({
      recyclerId:        r.recyclerId,
      recyclerName:      r.recycler?.name ?? "Unknown",
      lat:               r.recycler?.lat ?? null,
      lng:               r.recycler?.lng ?? null,
      authorizationStatus: r.recycler?.authorizationStatus ?? "VALID",
      materialsAccepted: r.recycler?.materialsAccepted ?? [],
      serviceAreaKm:     r.recycler?.serviceAreaKm ?? 25,
      categoryCode:      categoryById[r.categoryId]?.code ?? null,
      categoryNameEn:    categoryById[r.categoryId]?.nameEn ?? null,
      categoryNameMr:    categoryById[r.categoryId]?.nameMr ?? null,
      price:             Number(r.price),
      unit:              r.unit,
      validFrom:         r.validFrom,
    }));

    log.recycler.info("public rates fetched", { category: category ?? "all", count: rates.length });
    return res.json({ rates });
  } catch (err) {
    log.recycler.error("GET /public/rates error", err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /public/lots — no auth
//
// Collector app submits a lot directly to the server when the on-device
// SQLite DB is null (scaffold stage). Resolves categoryCode → categoryId
// server-side so the app never needs to know server UUIDs.
//
// Body: { collectorId, categoryCode, unit, quantity, condition,
//         sourceType?, recyclerId, acceptedRate, deviceId,
//         estimatedValue, collectionTs? }
// ---------------------------------------------------------------------------
publicRouter.post("/lots", async (req, res, next) => {
  try {
    const {
      collectorId, categoryCode, unit, quantity, condition,
      sourceType, recyclerId, acceptedRate, deviceId,
      estimatedValue, collectionTs, collectionLat, collectionLng,
    } = req.body ?? {};

    if (!collectorId || !categoryCode || !unit || !quantity || !condition || !recyclerId || !deviceId) {
      return res.status(400).json({ error: "missing_required_fields" });
    }

    const category = await prisma.category.findFirst({ where: { code: categoryCode.toUpperCase() } });
    if (!category) return res.status(400).json({ error: "unknown_category_code" });

    const recycler = await prisma.recycler.findUnique({ where: { id: recyclerId } });
    if (!recycler) return res.status(400).json({ error: "unknown_recycler" });

    const lotId = uuidv7();
    const acceptanceId = uuidv7();
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.collector.upsert({
        where: { id: collectorId },
        update: {},
        create: { id: collectorId, preferredLanguage: "mr", operatingArea: null },
      });

      await tx.lot.create({
        data: {
          id: lotId,
          collectorId,
          categoryId: category.id,
          unit: unit.toUpperCase(),
          quantity: String(quantity),
          condition: condition.toUpperCase(),
          sourceType: sourceType ?? null,
          estimatedValue: String(estimatedValue ?? 0),
          collectionTs: collectionTs ? new Date(collectionTs) : now,
          collectionLat: collectionLat != null ? Number(collectionLat) : null,
          collectionLng: collectionLng != null ? Number(collectionLng) : null,
          status: "DRAFT",
          deviceId,
        },
      });

      await tx.acceptance.create({
        data: {
          id: acceptanceId,
          lotId,
          recyclerId,
          acceptedRate: String(acceptedRate ?? 0),
          acceptedUnit: unit.toUpperCase(),
          acceptedTs: now,
          recyclerResponse: "NONE",
        },
      });
    });

    log.req.info("POST /public/lots", { lotId, deviceId, categoryCode });
    return res.status(201).json({ lotId, deviceId });
  } catch (err) {
    log.req.error("POST /public/lots error", err);
    return next(err);
  }
});

// GET /public/lots?device_id=xxx  — no auth
// Returns all lots for a device with their status derived from handover state.
publicRouter.get("/lots", async (req, res, next) => {
  try {
    const { device_id } = req.query;
    if (!device_id) return res.status(400).json({ error: "device_id_required" });

    const lots = await prisma.lot.findMany({
      where: { deviceId: device_id },
      include: {
        category: { select: { code: true, nameMr: true, nameEn: true } },
        handover: {
          select: {
            referenceCode: true,
            finalTotal: true,
            status: true,
            recycler: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const result = lots.map((l) => {
      let status = "PENDING";
      if (l.handover) {
        status = l.handover.status === "CONFIRMED" ? "CONFIRMED"
               : l.handover.status === "DISPUTED"  ? "DISPUTED"
               : "AWAITING_CONFIRM";
      }
      return {
        lotId:          l.id,
        categoryCode:   l.category?.code ?? null,
        categoryNameMr: l.category?.nameMr ?? null,
        quantity:       Number(l.quantity),
        unit:           l.unit,
        condition:      l.condition,
        estimatedValue: Number(l.estimatedValue),
        collectionTs:   l.collectionTs,
        collectionLat:  l.collectionLat,
        collectionLng:  l.collectionLng,
        status,
        referenceCode:  l.handover?.referenceCode ?? null,
        finalTotal:     l.handover?.finalTotal ? Number(l.handover.finalTotal) : null,
        recyclerName:   l.handover?.recycler?.name ?? null,
      };
    });

    log.req.info("GET /public/lots", { device_id, count: result.length });
    return res.json({ lots: result });
  } catch (err) {
    log.req.error("GET /public/lots error", err);
    return next(err);
  }
});
