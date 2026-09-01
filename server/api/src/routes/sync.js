import { Router } from "express";
import { prisma } from "../db.js";
import { validateRecord } from "@bhaav/core/validate";

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

// ---------------------------------------------------------------------------
// POST /sync/push
// No auth. Receives a batch of device-queued records (lots, acceptances,
// handovers, photos) uploaded when the device goes online.
//
// Design decisions:
// - Each record is processed individually, not in one transaction. A single
//   bad record inside one transaction would roll back everything and the device
//   would retry the whole batch forever. Per-record writes let good records
//   land and bad ones come back with a reason (SERVER.md §4).
// - Every writer uses upsert with update:{} — ON CONFLICT DO NOTHING semantics.
//   A record the device already sent is a fact; replaying the outbox must never
//   rewrite history. This is what makes retry safe.
// - Records are sorted parents-before-children so an acceptance can reference
//   a lot that arrives in the same batch.
// ---------------------------------------------------------------------------

const PUSH_ORDER = ["collector", "lot", "acceptance", "handover", "photo"];

// Convert a value to a Prisma-compatible Decimal string. Null passthrough.
const dec = (v) => (v === null || v === undefined ? null : String(v));

const writers = {
  async collector(tx, p) {
    await tx.collector.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        preferredLanguage: p.preferred_language,
        operatingArea: p.operating_area ?? null,
      },
    });
  },

  async lot(tx, p) {
    await tx.lot.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        collectorId: p.collector_id,
        categoryId: p.category_id,
        unit: p.unit,
        quantity: dec(p.quantity),
        condition: p.condition,
        sourceType: p.source_type ?? null,
        estimatedValue: dec(p.estimated_value),
        collectionLat: p.collection_lat ?? null,
        collectionLng: p.collection_lng ?? null,
        collectionTs: new Date(p.collection_ts),
        status: p.status,
        deviceId: p.device_id,
      },
    });
  },

  async acceptance(tx, p) {
    await tx.acceptance.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        lotId: p.lot_id,
        recyclerId: p.recycler_id,
        acceptedRate: dec(p.accepted_rate),
        acceptedUnit: p.accepted_unit,
        acceptedTs: new Date(p.accepted_ts),
        recyclerResponse: p.recycler_response ?? "NONE",
        responseTs: p.response_ts ? new Date(p.response_ts) : null,
      },
    });
  },

  async handover(tx, p) {
    await tx.handover.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        lotId: p.lot_id,
        recyclerId: p.recycler_id,
        referenceCode: p.reference_code,
        inspectedQuantity: dec(p.inspected_quantity),
        finalUnitPrice: dec(p.final_unit_price),
        finalTotal: dec(p.final_total),
        inspectedCondition: p.inspected_condition ?? null,
        downgradeReasonCode: p.downgrade_reason_code ?? null,
        collectorProtest: Boolean(p.collector_protest),
        handoverLat: p.handover_lat ?? null,
        handoverLng: p.handover_lng ?? null,
        handoverTs: new Date(p.handover_ts),
        status: p.status,
        recyclerConfirmedAt: p.recycler_confirmed_at ? new Date(p.recycler_confirmed_at) : null,
        collectorConfirmedAt: p.collector_confirmed_at ? new Date(p.collector_confirmed_at) : null,
      },
    });
  },

  async photo(tx, p) {
    await tx.photo.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        lotId: p.lot_id,
        kind: p.kind,
        sha256: p.sha256,
        bytes: p.bytes,
        uploadedAt: null,
      },
    });
  },
};

syncRouter.post("/push", async (req, res, next) => {
  try {
    const { records } = req.body ?? {};
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: "bad_request", detail: "records must be an array" });
    }

    // Parents before children, so an acceptance can reference a lot that
    // arrived in the same batch (SERVER.md §4).
    const sorted = [...records].sort(
      (a, b) => PUSH_ORDER.indexOf(a.type) - PUSH_ORDER.indexOf(b.type),
    );

    // Pre-load the set of lot ids in this batch so we can satisfy FK checks
    // for acceptances/handovers/photos without a database lookup per record.
    const batchLotIds = new Set(
      records.filter((r) => r.type === "lot").map((r) => r.payload?.id),
    );
    // Also cache lot ids we discover exist in the database during this batch.
    const knownLotIds = new Set(
      (
        await prisma.lot.findMany({
          where: { id: { in: [...batchLotIds] } },
          select: { id: true },
        })
      ).map((l) => l.id),
    );

    const applied = [];
    const rejected = [];

    for (const record of sorted) {
      const { type, payload } = record;
      const id = record.id ?? payload?.id;

      // Validate first — same code runs on device, so device and server agree.
      const errors = validateRecord(type, payload);
      if (errors.length > 0) {
        rejected.push({ id, reason: errors.join("; ") });
        continue;
      }

      // Reject child records whose lot is not in this batch and not in the DB.
      if (
        (type === "acceptance" || type === "handover" || type === "photo") &&
        !batchLotIds.has(payload.lot_id) &&
        !knownLotIds.has(payload.lot_id)
      ) {
        const exists = await prisma.lot.findUnique({
          where: { id: payload.lot_id },
          select: { id: true },
        });
        if (!exists) {
          rejected.push({ id, reason: `unknown lot ${payload.lot_id}` });
          continue;
        }
        knownLotIds.add(payload.lot_id);
      }

      try {
        await writers[type](prisma, payload);
        applied.push(id);
        // Once a lot lands, child records in the same batch can reference it.
        if (type === "lot") knownLotIds.add(payload.id);
      } catch (err) {
        rejected.push({ id, reason: err.message.split("\n").slice(-1)[0].trim() });
      }
    }

    res.json({ applied, rejected });
  } catch (err) {
    next(err);
  }
});
