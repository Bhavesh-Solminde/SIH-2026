/**
 * buildDetectPayload — assembles the full request body for POST /detect.
 *
 * The AI/ML service is stateless and has no database access, so every
 * history feature is computed here and passed in. This keeps server/aiml
 * database-free and makes it easy to unit-test with canned data.
 *
 * Shape follows AI.md §11. Fields:
 *   run_id, as_of, categories[], recyclers[], rates[], lots[],
 *   acceptances[], handovers[]
 */
import { uuidv7 } from "@bhaav/core/ids";

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ asOf?: string }} opts
 */
export async function buildDetectPayload(prisma, { asOf } = {}) {
  const run_id = uuidv7();
  const as_of = asOf ?? new Date().toISOString();

  const [categories, recyclers, rates, lots, acceptances, handovers] = await Promise.all([
    prisma.category.findMany({
      select: {
        id: true,
        code: true,
        nameEn: true,
        defaultUnit: true,
        criticalMinerals: true,
      },
    }),

    prisma.recycler.findMany({
      select: {
        id: true,
        name: true,
        district: true,
        lat: true,
        lng: true,
        serviceAreaKm: true,
        authorizationStatus: true,
        materialsAccepted: true,
      },
    }),

    prisma.rate.findMany({
      select: {
        id: true,
        recyclerId: true,
        categoryId: true,
        unit: true,
        price: true,
        source: true,
        validFrom: true,
      },
      orderBy: { validFrom: "desc" },
    }),

    prisma.lot.findMany({
      select: {
        id: true,
        collectorId: true,
        categoryId: true,
        unit: true,
        quantity: true,
        condition: true,
        estimatedValue: true,
        collectionLat: true,
        collectionLng: true,
        collectionTs: true,
        status: true,
      },
      where: { createdAt: { lte: new Date(as_of) } },
    }),

    prisma.acceptance.findMany({
      select: {
        id: true,
        lotId: true,
        recyclerId: true,
        acceptedRate: true,
        acceptedUnit: true,
        acceptedTs: true,
        recyclerResponse: true,
      },
      where: { createdAt: { lte: new Date(as_of) } },
    }),

    prisma.handover.findMany({
      select: {
        id: true,
        lotId: true,
        recyclerId: true,
        referenceCode: true,
        inspectedQuantity: true,
        finalUnitPrice: true,
        finalTotal: true,
        inspectedCondition: true,
        downgradeReasonCode: true,
        collectorProtest: true,
        handoverTs: true,
        status: true,
        recyclerConfirmedAt: true,
        collectorConfirmedAt: true,
      },
      where: { createdAt: { lte: new Date(as_of) } },
    }),
  ]);

  return {
    run_id,
    as_of,
    categories: categories.map((c) => ({
      id: c.id,
      code: c.code,
      name_en: c.nameEn,
      default_unit: c.defaultUnit,
      critical_minerals: c.criticalMinerals,
    })),
    recyclers: recyclers.map((r) => ({
      id: r.id,
      name: r.name,
      district: r.district ?? null,
      lat: r.lat,
      lng: r.lng,
      service_area_km: r.serviceAreaKm,
      authorization_status: r.authorizationStatus,
      materials_accepted: r.materialsAccepted,
    })),
    rates: rates.map((r) => ({
      id: r.id,
      recycler_id: r.recyclerId,
      category_id: r.categoryId,
      unit: r.unit,
      price: Number(r.price),
      source: r.source,
      valid_from: r.validFrom.toISOString(),
    })),
    lots: lots.map((l) => ({
      id: l.id,
      collector_id: l.collectorId,
      category_id: l.categoryId,
      unit: l.unit,
      quantity: Number(l.quantity),
      condition: l.condition,
      estimated_value: Number(l.estimatedValue),
      collection_lat: l.collectionLat ?? null,
      collection_lng: l.collectionLng ?? null,
      collection_ts: l.collectionTs.toISOString(),
      status: l.status,
    })),
    acceptances: acceptances.map((a) => ({
      id: a.id,
      lot_id: a.lotId,
      recycler_id: a.recyclerId,
      accepted_rate: Number(a.acceptedRate),
      accepted_unit: a.acceptedUnit,
      accepted_ts: a.acceptedTs.toISOString(),
      recycler_response: a.recyclerResponse,
    })),
    handovers: handovers.map((h) => ({
      id: h.id,
      lot_id: h.lotId,
      recycler_id: h.recyclerId,
      reference_code: h.referenceCode,
      inspected_quantity: Number(h.inspectedQuantity),
      final_unit_price: Number(h.finalUnitPrice),
      final_total: Number(h.finalTotal),
      inspected_condition: h.inspectedCondition ?? null,
      downgrade_reason_code: h.downgradeReasonCode ?? null,
      collector_protest: h.collectorProtest,
      handover_ts: h.handoverTs.toISOString(),
      status: h.status,
      recycler_confirmed_at: h.recyclerConfirmedAt?.toISOString() ?? null,
      collector_confirmed_at: h.collectorConfirmedAt?.toISOString() ?? null,
    })),
  };
}
