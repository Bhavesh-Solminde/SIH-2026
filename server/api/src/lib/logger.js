/**
 * Central logger for the Bhaav API.
 *
 * Output format (one line per event):
 *   [2026-09-01T08:00:00.000Z] INFO  [api/auth] POST /auth/login → 200 (12ms)
 *
 * Usage:
 *   import { logger } from '../lib/logger.js';
 *   const log = logger('auth');
 *   log.info('login attempt', { email });
 *   log.warn('invalid credentials', { email });
 *   log.error('db error', err);
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL ?? 'debug'];

function pad(s, n) { return String(s).padEnd(n); }

function write(level, ns, msg, meta) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const ts = new Date().toISOString();
  const lvl = level.toUpperCase().padEnd(5);
  const metaStr = meta
    ? ' ' + (meta instanceof Error
        ? JSON.stringify({ message: meta.message, stack: meta.stack?.split('\n')[1]?.trim() })
        : JSON.stringify(meta))
    : '';
  process.stdout.write(`[${ts}] ${lvl} [api/${ns}] ${msg}${metaStr}\n`);
}

export function logger(namespace) {
  return {
    debug: (msg, meta) => write('debug', namespace, msg, meta),
    info:  (msg, meta) => write('info',  namespace, msg, meta),
    warn:  (msg, meta) => write('warn',  namespace, msg, meta),
    error: (msg, meta) => write('error', namespace, msg, meta),
  };
}

// Pre-built loggers for each service area
export const log = {
  req:      logger('request'),
  auth:     logger('auth'),
  recycler: logger('recycler'),
  handover: logger('handover'),
  sync:     logger('sync'),
  detect:   logger('detect'),
  aiml:     logger('aiml'),
  db:       logger('db'),
  admin:    logger('admin'),
  report:   logger('report'),
};
