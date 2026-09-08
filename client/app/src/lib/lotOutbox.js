import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from './logger';

/**
 * A real queue for the lot-accept "offline fallback" — AcceptScreen.jsx used
 * to claim it queued a lot locally when POST /public/lots failed, but there
 * was no local DB (`db` is always null in this build — Expo Go has no native
 * SQLite) and nothing else stored the draft either. The collector saw
 * "Accepted!" and a QR code for a lot that existed nowhere: not on the
 * server, not on the device. Reopening the app, or just navigating away,
 * lost it silently.
 *
 * This is the fix: AsyncStorage (already used for the Ledger cache) holds
 * each queued draft under the SAME lotId AcceptScreen already generated and
 * showed on the QR code. server/api/src/routes/public.js's POST /public/lots
 * now accepts that client-supplied lotId and creates the lot under it — so
 * once flushLotOutbox() successfully retries, the QR the collector already
 * showed the recycler resolves to a real lot, not a stale id.
 */

const KEY = 'bhaav_lot_outbox_v1';

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    log.sync.warn('lotOutbox read failed', err);
    return [];
  }
}

async function writeAll(entries) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  } catch (err) {
    log.sync.warn('lotOutbox write failed', err);
  }
}

// body must be the exact POST /public/lots payload, including lotId — the
// same body AcceptScreen already tried to send once and failed. meta is
// display-only (e.g. recyclerName) — never sent to the server, kept
// separate so nothing display-specific leaks into the API payload.
export async function queueLot(body, meta = {}) {
  const all = await readAll();
  all.push({ lotId: body.lotId, body, meta, queuedAt: new Date().toISOString() });
  await writeAll(all);
  log.sync.info('lot queued for retry', { lotId: body.lotId });
}

export async function getQueuedLots() {
  return readAll();
}

export async function removeQueuedLot(lotId) {
  const all = await readAll();
  await writeAll(all.filter((e) => e.lotId !== lotId));
}

// Attempts every queued lot once, in order. A network-level failure (still
// offline) stops the run immediately — retrying the rest against a
// connection that just failed only wastes time until the next flush. A 4xx
// from the server (malformed payload, category deleted since) is not
// recoverable by retrying either, but IS distinct from "still offline": it's
// logged and the entry is dropped rather than retried forever.
export async function flushLotOutbox(apiUrl) {
  const all = await readAll();
  let synced = 0;
  for (const entry of all) {
    let res;
    try {
      res = await fetch(`${apiUrl}/public/lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.body),
      });
    } catch (err) {
      log.sync.debug('lotOutbox flush stopped — still offline', { message: err?.message });
      break;
    }

    if (res.ok) {
      await removeQueuedLot(entry.lotId);
      synced += 1;
      log.sync.info('queued lot synced', { lotId: entry.lotId });
    } else if (res.status >= 400 && res.status < 500) {
      log.sync.warn('queued lot rejected — dropping, not retrying', { lotId: entry.lotId, status: res.status });
      await removeQueuedLot(entry.lotId);
    } else {
      log.sync.warn('queued lot: server error, will retry later', { lotId: entry.lotId, status: res.status });
    }
  }
  const remaining = (await readAll()).length;
  return { synced, remaining };
}
