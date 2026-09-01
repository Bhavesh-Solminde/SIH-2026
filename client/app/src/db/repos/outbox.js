import { uuidv7 } from "@bhaav/core/ids";

/**
 * The outbox is append-only and idempotent by construction: the server upserts
 * by the record's own uuid, so replaying a batch is harmless (SERVER.md 2.3).
 *
 * A row is enqueued in the SAME call that writes the record. If a screen ever
 * writes a lot without enqueuing, that lot silently never reaches the server —
 * so no screen writes directly; everything goes through a repo.
 */
export async function enqueue(db, entityType, entityId, payload) {
  const id = uuidv7();
  await db.outbox.create({
    data: {
      id,
      entityType,
      entityId,
      payload: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
      attempts: 0,
    },
  });
  return id;
}

export async function pending(db, limit = 500) {
  return db.outbox.findMany({
    where: { syncedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function pendingCount(db) {
  return db.outbox.count({ where: { syncedAt: null } });
}

export async function markSynced(db, ids) {
  if (ids.length === 0) return;
  await db.outbox.updateMany({
    where: { id: { in: ids } },
    data: { syncedAt: new Date().toISOString() },
  });
}

/**
 * A rejected row STAYS pending. The server told us why; the reason is stored
 * so the sync detail sheet can show it, and the row is retried on the next
 * drain. Deleting it would lose the collector's record permanently.
 */
export async function bumpAttempt(db, id, error) {
  await db.outbox.update({
    where: { id },
    data: { attempts: { increment: 1 }, lastError: error ?? null },
  });
}
