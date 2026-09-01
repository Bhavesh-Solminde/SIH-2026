import { uuidv7 } from "@bhaav/core/ids";
import { enqueue } from "./outbox.js";

const WEEK_MS = 7 * 86_400_000;

export async function createLot(db, draft) {
  const id = uuidv7();
  const createdAt = new Date().toISOString();

  const payload = {
    id,
    collector_id: draft.collectorId,
    category_id: draft.categoryId,
    unit: draft.unit,
    quantity: draft.quantity,
    condition: draft.condition,
    source_type: draft.sourceType ?? null,
    estimated_value: draft.estimatedValue,
    collection_lat: draft.collectionLat ?? null,
    collection_lng: draft.collectionLng ?? null,
    collection_ts: draft.collectionTs,
    status: "DRAFT",
    device_id: draft.deviceId,
  };

  // One interactive transaction: the lot row and its outbox row commit
  // together or not at all. Passing `tx` into enqueue routes its create
  // through the same transaction. If a lot could land without its outbox row,
  // it would silently never sync.
  await db.$transaction(async (tx) => {
    await tx.lot.create({
      data: {
        id,
        collectorId: draft.collectorId,
        categoryId: draft.categoryId,
        categoryCode: draft.categoryCode,
        unit: draft.unit,
        quantity: draft.quantity,
        condition: draft.condition,
        sourceType: draft.sourceType ?? null,
        estimatedValue: draft.estimatedValue,
        collectionLat: draft.collectionLat ?? null,
        collectionLng: draft.collectionLng ?? null,
        collectionTs: draft.collectionTs,
        status: "DRAFT",
        deviceId: draft.deviceId,
        createdAt,
      },
    });
    await enqueue(tx, "lot", id, payload);
  });

  return { id, status: "DRAFT", created_at: createdAt, ...draft };
}

export async function setLotStatus(db, id, status) {
  await db.lot.update({ where: { id }, data: { status } });
}

export async function listLots(db, limit = 50) {
  const rows = await db.lot.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      handover: { select: { finalTotal: true, status: true, collectorConfirmedAt: true } },
    },
  });
  // Flatten the handover fields the ledger reads. The lot keeps its own
  // `status`; the handover state is surfaced separately as `handoverStatus`.
  return rows.map((l) => ({
    ...l,
    finalTotal: l.handover?.finalTotal ?? null,
    handoverStatus: l.handover?.status ?? null,
    collectorConfirmedAt: l.handover?.collectorConfirmedAt ?? null,
  }));
}

export async function getLot(db, id) {
  return db.lot.findUnique({ where: { id } });
}

/**
 * Only a CONFIRMED handover counts. An unconfirmed one is an amount the
 * collector has not agreed to yet, and showing it as earnings would be the app
 * telling them they have money they do not have.
 *
 * handoverTs is an ISO-8601 string. Device-created handovers use
 * `new Date().toISOString()` (UTC, fixed width), so a lexicographic `gte`
 * against the UTC week/month cursors is a correct chronological comparison.
 */
export async function earningsTotals(db) {
  const now = Date.now();
  const weekStart = new Date(now - WEEK_MS).toISOString();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const sumSince = async (since) => {
    const agg = await db.handover.aggregate({
      _sum: { finalTotal: true },
      where: { status: "CONFIRMED", handoverTs: { gte: since } },
    });
    return Number(agg._sum.finalTotal ?? 0);
  };

  return { week: await sumSince(weekStart), month: await sumSince(monthStart) };
}
