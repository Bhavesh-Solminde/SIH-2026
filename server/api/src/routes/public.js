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
 *     materialsAccepted, serviceAreaKm, pickupAvailable, address,
 *     categoryCode, categoryNameEn, categoryNameMr,
 *     price, unit, validFrom }
 */

import { Router } from "express";
import { prisma } from "../db.js";
import { log, logger } from "../lib/logger.js";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { MPCB_SOURCE, sourceAgeDays } from "../lib/mpcbSource.js";
import { sendSms, smsEnabled } from "../lib/sms.js";

// The pre-built `log` export has no `public` or `sms` namespace — same
// situation lib/sms.js documents for itself. Use the generic factory rather
// than inventing a key on the shared object.
const smsLog = logger("sms");

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
            // A field absent from this select reads as undefined in the
            // projection below and ships as null — silently, with no error.
            // pickupAvailable in particular feeds a ranking weight, so a
            // missing select here quietly zeroes that whole term.
            pickupAvailable: true,
            address: true,
            registrationNo: true,
            validityTo: true,
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
      pickupAvailable:   r.recycler?.pickupAvailable === true,
      address:           r.recycler?.address ?? null,
      // Checkable evidence, not a decorative tick: the MPCB registration this
      // authorisation rests on, and the date it runs out.
      registrationNo:    r.recycler?.registrationNo ?? null,
      validityTo:        r.recycler?.validityTo ?? null,
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
/**
 * GET /public/authorisation
 *
 * The filtering, made visible. Every recycler the app shows is authorised, so a
 * tick on each one carries no information — what a judge (or a collector) can
 * actually check is how many were excluded and why. Counts are computed live
 * from the same table the ranking gates on, so this can never drift from the
 * behaviour it describes.
 */
publicRouter.get("/authorisation", async (_req, res, next) => {
  try {
    const grouped = await prisma.recycler.groupBy({
      by: ["authorizationStatus"],
      _count: { _all: true },
    });
    const counts = Object.fromEntries(grouped.map((g) => [g.authorizationStatus, g._count._all]));
    const valid = counts.VALID ?? 0;
    const lapsed = counts.LAPSED_IN_LIST ?? 0;
    const listed = grouped.reduce((n, g) => n + g._count._all, 0);

    return res.json({
      listed,
      valid,
      lapsed,
      shownInApp: valid,
      hiddenFromApp: listed - valid,
      source: MPCB_SOURCE,
      sourceAgeDays: sourceAgeDays(),
    });
  } catch (err) {
    log.recycler.error("GET /public/authorisation error", err);
    return next(err);
  }
});

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

    // Fire-and-forget recycler notification, fired AFTER the transaction has
    // committed — same fail-open rule as scoreHandover/runDetection in
    // handover.js. A Fast2SMS outage or timeout must never cost a collector
    // their recorded lot, and a slow third-party HTTP call must never hold
    // the transaction open. No collector identity travels in the message:
    // only category, quantity, and an opaque reference code derived from the
    // lot id (never the collector id or device id) — the project's ground
    // rule is a pseudonymous collector.
    if (smsEnabled() && recycler.phone) {
      const message =
        `Bhaav: new acceptance. ${category.code} ${quantity}${String(unit).toLowerCase()}, ` +
        `ref ${referenceCodeFromUuid(lotId)}. Collector arriving. Open console to respond.`;
      void sendSms({ numbers: recycler.phone, message })
        .then((result) => {
          if (!result.ok) smsLog.warn("recycler notify not sent", { lotId, reason: result.reason });
        })
        .catch((err) => {
          smsLog.warn("recycler notify failed", { lotId, reason: err?.message });
        });
    }

    // The reference code travels back with the lot. It is derived from the
    // lot id and is valid the moment the lot exists — the recycler scans it
    // at the gate, long before any handover row is written — so the app must
    // be able to render the QR immediately rather than waiting for an
    // inspection that cannot happen until someone has scanned it.
    return res.status(201).json({
      lotId,
      deviceId,
      referenceCode: referenceCodeFromUuid(lotId),
    });
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
        // Always derivable from the lot id — never null. Reading it off the
        // handover row meant every lot showed no reference code until after
        // the recycler had inspected it, and the recycler cannot inspect a
        // lot they have not been able to scan. The handover's stored code is
        // preferred only because it is the authoritative persisted value;
        // both are computed the same way from the same id.
        referenceCode:  l.handover?.referenceCode ?? referenceCodeFromUuid(l.id),
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

// ---------------------------------------------------------------------------
// POST /public/collector/:id/contact — no auth
//
// Optional opt-in: a collector may choose to leave a phone number so the app
// can relay a recycler's accept/decline as an SMS. README ground rule 7
// permits an optional phone, never a mandatory one — this endpoint is the
// only place a number is ever collected, and it lives in its own table
// (collector_contact), never on `collector` itself. See DB.md 3.1 and the
// CollectorContact model comment in schema.prisma.
//
// The collector row is upserted the same lazy way POST /public/lots does it:
// a collector may opt in before ever submitting a lot.
// ---------------------------------------------------------------------------
const PHONE_RE = /^\d{10}$/;

publicRouter.post("/collector/:id/contact", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { phone } = req.body ?? {};

    if (typeof phone !== "string" || !PHONE_RE.test(phone)) {
      return res.status(400).json({ error: "phone_must_be_ten_digits" });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.collector.upsert({
        where: { id },
        update: {},
        create: { id, preferredLanguage: "mr", operatingArea: null },
      });

      await tx.collectorContact.upsert({
        where: { collectorId: id },
        update: { phone, consentTs: now },
        create: { collectorId: id, phone, consentTs: now },
      });
    });

    log.req.info("POST /public/collector/:id/contact", { collectorId: id.slice(0, 8) });
    return res.status(201).json({ ok: true });
  } catch (err) {
    log.req.error("POST /public/collector/:id/contact error", err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /public/collector/:id/contact — no auth
//
// The DPDP erasure right, in one statement. Idempotent by design: deleting a
// number that was never given — or a collector id that never existed — must
// succeed, never 404. This is a right, not a lookup, and it must never fail
// noisily.
// ---------------------------------------------------------------------------
publicRouter.delete("/collector/:id/contact", async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.collectorContact.deleteMany({ where: { collectorId: id } });
    log.req.info("DELETE /public/collector/:id/contact", { collectorId: id.slice(0, 8) });
    return res.status(200).json({ ok: true });
  } catch (err) {
    log.req.error("DELETE /public/collector/:id/contact error", err);
    return next(err);
  }
});
