import { prisma } from '../db.js';
import { log } from './logger.js';

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function runMpcbSync() {
  try {
    const now = new Date();

    // Recyclers whose validityTo has passed → mark LAPSED
    const lapsed = await prisma.recycler.updateMany({
      where: { authorizationStatus: 'VALID', validityTo: { lt: now } },
      data: { authorizationStatus: 'LAPSED_IN_LIST', updatedAt: now },
    });

    // Recyclers with a future validityTo that were previously lapsed → restore
    const restored = await prisma.recycler.updateMany({
      where: { authorizationStatus: 'LAPSED_IN_LIST', validityTo: { gte: now } },
      data: { authorizationStatus: 'VALID', updatedAt: now },
    });

    if (lapsed.count + restored.count > 0) {
      log.req.info('mpcb-sync', { lapsed: lapsed.count, restored: restored.count });
    }
  } catch (err) {
    log.req.error('mpcb-sync failed', err);
  }
}

export function startMpcbSyncJob() {
  runMpcbSync();
  setInterval(runMpcbSync, INTERVAL_MS);
}
