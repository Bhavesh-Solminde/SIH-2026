import { pending, pendingCount, markSynced, bumpAttempt } from '../db/repos/outbox';
import { log } from '../lib/logger';

const BATCH_SIZE = 50;
const FETCH_LIMIT = 500;

export async function sync(apiBaseUrl, db) {
  const stats = { applied: 0, rejected: 0, pending: 0 };

  // DB not initialised yet (scaffold stub or first boot) — skip silently
  if (!db) {
    log.sync.debug('db not ready — skipping sync');
    return stats;
  }

  try {
    const allPending = await pending(db, FETCH_LIMIT);
    log.sync.info('sync started', { pendingTotal: allPending.length, apiBaseUrl });

    if (allPending.length === 0) {
      stats.pending = 0;
      log.sync.debug('nothing to sync');
      return stats;
    }

    for (let i = 0; i < allPending.length; i += BATCH_SIZE) {
      const batch = allPending.slice(i, i + BATCH_SIZE);
      log.sync.debug(`batch ${Math.floor(i / BATCH_SIZE) + 1}`, { size: batch.length });

      const records = batch.map((row) => ({
        type: row.entityType,
        id: row.entityId,
        payload: (() => {
          try { return JSON.parse(row.payload); }
          catch { return row.payload; }
        })(),
      }));

      let result;
      try {
        const res = await fetch(`${apiBaseUrl}/sync/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records }),
        });

        if (!res.ok) {
          log.sync.warn(`/sync/push returned ${res.status} — leaving batch pending`);
          continue;
        }

        result = await res.json();
      } catch (fetchErr) {
        log.sync.warn('fetch failed (offline?)', fetchErr);
        continue;
      }

      const appliedEntityIds = new Set(result.applied ?? []);
      const appliedOutboxIds = batch
        .filter((row) => appliedEntityIds.has(row.entityId))
        .map((row) => row.id);

      if (appliedOutboxIds.length > 0) {
        await markSynced(db, appliedOutboxIds);
        stats.applied += appliedOutboxIds.length;
        log.sync.info('batch applied', { count: appliedOutboxIds.length });
      }

      const rejectedEntityIds = new Set((result.rejected ?? []).map((r) =>
        typeof r === 'string' ? r : r.id
      ));
      for (const row of batch) {
        if (rejectedEntityIds.has(row.entityId)) {
          await bumpAttempt(db, row.id, result.errors?.[row.entityId] ?? 'Rejected by server');
          stats.rejected += 1;
          log.sync.warn('record rejected', { entityId: row.entityId, type: row.entityType });
        }
      }
    }
  } catch (err) {
    log.sync.error('unexpected sync error', err);
  } finally {
    try {
      stats.pending = await pendingCount(db);
    } catch (_) {}
  }

  log.sync.info('sync complete', stats);
  return stats;
}

export async function syncAndGetPending(apiBaseUrl, db) {
  try {
    const result = await sync(apiBaseUrl, db);
    return result.pending;
  } catch {
    return null;
  }
}
