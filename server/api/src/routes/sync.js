import { Router } from "express";
import { prisma } from "../db.js";

export const syncRouter = Router();

// Prisma returns Decimal instances for NUMERIC/DECIMAL columns. The device
// expects plain JSON numbers. Convert at the API boundary, once, so every
// consumer gets a number and nobody has to call Number() downstream.
const num = (d) => (d === null || d === undefined ? null : Number(d));

// ---------------------------------------------------------------------------
// loadSnapshot — full reference dataset shared by both endpoints.
// Returns the same shape as GET /sync/bootstrap.
// ---------------------------------------------------------------------------
async function loadSnapshot() {
  const [categories, recyclers, rateRows, factors] = await Promise.all([
    prisma.category.findMany({ orderBy: { code: "asc" } }),
    prisma.recycler.findMany({
      where: { authorizationStatus: "VALID" },
      orderBy: { name: "asc" },
    }),
    // current_rate collapses the append-only rate history to the single newest
    // RECYCLER_PUBLISHED row per (recycler_id, category_id) pair — DB.md 3.4.
    // We join to recycler and category here to filter by VALID status and
    // resolve the category code in one query rather than N+1 lookups.
    prisma.$queryRaw`
      SELECT cr.recycler_id, c.code AS category_code, cr.unit, cr.price, cr.valid_from
      FROM current_rate cr
      JOIN recycler r ON r.id = cr.recycler_id
      JOIN category c ON c.id = cr.category_id
      WHERE r.authorization_status = 'VALID'
      ORDER BY r.name, c.code`,
    prisma.conditionFactor.findMany(),
  ]);

  // Build a map from category id → code so we can resolve parentCode without
  // a second query.
  const codeById = new Map(categories.map((c) => [c.id, c.code]));

  return {
    serverTime: new Date().toISOString(),
    categories: categories.map((c) => ({
      id: c.id,
      code: c.code,
      parentCode: c.parentId ? (codeById.get(c.parentId) ?? null) : null,
      nameEn: c.nameEn,
      nameMr: c.nameMr,
      nameHi: c.nameHi,
      iconKey: c.iconKey,
      defaultUnit: c.defaultUnit,
      criticalMinerals: c.criticalMinerals,
      expectedQtyMin: num(c.expectedQtyMin),
      expectedQtyMax: num(c.expectedQtyMax),
    })),
    recyclers: recyclers.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      district: r.district,
      phone: r.phone,
      authorizationStatus: r.authorizationStatus,
      validityTo: r.validityTo ? r.validityTo.toISOString().slice(0, 10) : null,
      serviceAreaKm: r.serviceAreaKm,
      pickupAvailable: r.pickupAvailable,
      materialsAccepted: r.materialsAccepted,
    })),
    rates: rateRows.map((r) => ({
      recyclerId: r.recycler_id,
      categoryCode: r.category_code,
      unit: r.unit,
      price: num(r.price),
      validFrom: r.valid_from.toISOString(),
    })),
    conditionFactors: Object.fromEntries(
      factors.map((f) => [f.condition, num(f.factor)]),
    ),
  };
}

export { loadSnapshot };

// ---------------------------------------------------------------------------
// GET /sync/bootstrap
// No auth. Returns the full reference dataset needed on app first-run.
// The device stores serverTime as its cursor for the next /sync/delta call.
// ---------------------------------------------------------------------------
syncRouter.get("/bootstrap", async (_req, res, next) => {
  try {
    res.json(await loadSnapshot());
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /sync/delta?since=<ISO-8601>
// No auth. Returns only the records that changed after the cursor.
// 400 if `since` is missing or not a parseable date.
// ---------------------------------------------------------------------------
syncRouter.get("/delta", async (req, res, next) => {
  try {
    const since = new Date(String(req.query.since ?? ""));
    if (!Number.isFinite(since.getTime())) {
      return res.status(400).json({
        error: "bad_request",
        detail: "since must be an ISO-8601 timestamp",
      });
    }

    // Load the full snapshot to reuse the category/recycler shape logic, then
    // filter it down to records that changed after `since`. This avoids
    // duplicating the serialisation logic in a second code path.
    const snapshot = await loadSnapshot();

    const [changedCategories, changedRecyclers, lapsedRecyclers] = await Promise.all([
      // Categories are reference data that never update in production, but
      // createdAt lets a client pick up newly-added categories after a server
      // update without a full bootstrap.
      prisma.category.findMany({
        where: { createdAt: { gt: since } },
        select: { code: true },
      }),
      // Recyclers whose status is still VALID and whose record was updated
      // after the cursor (e.g. a service-area or phone number change).
      prisma.recycler.findMany({
        where: { updatedAt: { gt: since }, authorizationStatus: "VALID" },
        select: { id: true },
      }),
      // Recyclers that lapsed after the cursor. These must be sent in
      // removedRecyclerIds so the device removes them from its local cache —
      // otherwise a collector is routed to a facility that is no longer valid.
      prisma.recycler.findMany({
        where: { updatedAt: { gt: since }, authorizationStatus: "LAPSED_IN_LIST" },
        select: { id: true },
      }),
    ]);

    // Rates are append-only, so a rate "changed since cursor" means a new row
    // was created after the cursor. The current_rate view has already collapsed
    // history to the newest RECYCLER_PUBLISHED row per pair, so we join on it
    // and check the raw rate table's created_at for newness.
    const freshRates = await prisma.$queryRaw`
      SELECT DISTINCT cr.recycler_id, c.code AS category_code, cr.unit, cr.price, cr.valid_from
      FROM current_rate cr
      JOIN rate raw ON raw.recycler_id = cr.recycler_id
                   AND raw.category_id = cr.category_id
                   AND raw.valid_from  = cr.valid_from
      JOIN recycler r ON r.id = cr.recycler_id
      JOIN category c ON c.id = cr.category_id
      WHERE r.authorization_status = 'VALID'
        AND raw.created_at > ${since}`;

    const changedCodes  = new Set(changedCategories.map((c) => c.code));
    const changedRecIds = new Set(changedRecyclers.map((r) => r.id));

    res.json({
      serverTime: snapshot.serverTime,
      categories: snapshot.categories.filter((c) => changedCodes.has(c.code)),
      recyclers:  snapshot.recyclers.filter((r) => changedRecIds.has(r.id)),
      rates: freshRates.map((r) => ({
        recyclerId:   r.recycler_id,
        categoryCode: r.category_code,
        unit:         r.unit,
        price:        num(r.price),
        validFrom:    r.valid_from.toISOString(),
      })),
      removedRecyclerIds: lapsedRecyclers.map((r) => r.id),
      conditionFactors: snapshot.conditionFactors,
    });
  } catch (err) {
    next(err);
  }
});
