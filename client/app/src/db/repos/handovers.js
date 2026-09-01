import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { enqueue } from "./outbox.js";
import { setLotStatus } from "./lots.js";

/**
 * Written when the recycler's console pushes the inspected figures to this
 * device (or, offline, when the collector's side records what was agreed).
 * The reference code is derived from the LOT uuid, not the handover uuid, so
 * the QR the collector shows and the code the console looks up are the same
 * string with no round trip.
 */
export async function createHandover(db, p) {
  const id = p.id ?? uuidv7();
  const referenceCode = referenceCodeFromUuid(p.lotId);
  const createdAt = new Date().toISOString();

  await db.$transaction(async (tx) => {
    // upsert with an empty `update` is the Prisma equivalent of INSERT OR
    // IGNORE: a handover already present is left untouched, never rewritten —
    // it is an event, not mutable state.
    await tx.handover.upsert({
      where: { id },
      update: {},
      create: {
        id,
        lotId: p.lotId,
        recyclerId: p.recyclerId,
        referenceCode,
        inspectedQuantity: p.inspectedQuantity,
        finalUnitPrice: p.finalUnitPrice,
        finalTotal: p.finalTotal,
        inspectedCondition: p.inspectedCondition ?? null,
        downgradeReasonCode: p.downgradeReasonCode ?? null,
        collectorProtest: false,
        handoverLat: p.handoverLat ?? null,
        handoverLng: p.handoverLng ?? null,
        handoverTs: p.handoverTs,
        status: "PENDING_COLLECTOR",
        recyclerConfirmedAt: p.recyclerConfirmedAt ?? null,
        collectorConfirmedAt: null,
        createdAt,
      },
    });
    await setLotStatus(tx, p.lotId, "HANDED_OVER");
  });

  return db.handover.findUnique({ where: { lotId: p.lotId } });
}

/**
 * The collector's side of the two-sided confirmation. Recorded locally and
 * enqueued; the record is finalised on this device whether or not there is a
 * network, and syncs later with no warning shown (FRONTEND.md section 3).
 *
 * `protest` is stored separately from the signature. A collector standing at
 * the counter with the material already delivered will sign almost anything —
 * a signature is not agreement (AI-ANOMALY-SPEC edge case 13).
 */
export async function confirmHandover(db, { lotId, agree, protest = false, confirmedAt }) {
  const at = confirmedAt ?? new Date().toISOString();
  const status = agree ? "CONFIRMED" : "DISPUTED";

  await db.$transaction(async (tx) => {
    // Scoped to an unsigned record, so replaying the outbox cannot move a
    // record the collector already closed. updateMany returns a count instead
    // of throwing when nothing matches, which is exactly the idempotent
    // behaviour we want.
    await tx.handover.updateMany({
      where: { lotId, collectorConfirmedAt: null },
      data: { collectorConfirmedAt: at, status, collectorProtest: protest },
    });
    await enqueue(tx, "handover_confirm", lotId, {
      lot_id: lotId,
      agree,
      protest,
      confirmed_at: at,
    });
  });

  return db.handover.findUnique({ where: { lotId } });
}

export async function handoverForLot(db, lotId) {
  return db.handover.findUnique({ where: { lotId } });
}
