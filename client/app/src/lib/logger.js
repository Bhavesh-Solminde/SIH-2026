/**
 * Central logger for the Bhaav collector app.
 *
 * In dev (Expo): writes coloured output to the Metro bundler console.
 * In prod: no-ops (console.log stripped by release builds).
 *
 * Usage:
 *   import { alog } from '../lib/logger';
 *   alog.screen('HomeScreen').info('mounted', { recyclerId });
 *   alog.db('lots').warn('createLot failed', err);
 *
 * Or use the pre-built loggers:
 *   import { log } from '../lib/logger';
 *   log.home.info('earnings loaded', { total });
 */

const IS_DEV = __DEV__;

// Colour codes for Metro console (ANSI)
const COLOURS = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
};

function ts() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
}

function write(level, ns, msg, meta) {
  if (!IS_DEV) return;
  const col = COLOURS[level] ?? '';
  const rst = COLOURS.reset;
  const metaStr = meta
    ? ' ' + (meta instanceof Error
        ? `{ message: ${meta.message} }`
        : JSON.stringify(meta))
    : '';
  const line = `${col}[${ts()}] ${level.toUpperCase().padEnd(5)} [app/${ns}] ${msg}${metaStr}${rst}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logger(namespace) {
  return {
    debug: (msg, meta) => write('debug', namespace, msg, meta),
    info:  (msg, meta) => write('info',  namespace, msg, meta),
    warn:  (msg, meta) => write('warn',  namespace, msg, meta),
    error: (msg, meta) => write('error', namespace, msg, meta),
  };
}

// Pre-built loggers per screen / layer
export const log = {
  home:     logger('home'),
  camera:   logger('camera'),
  category: logger('category'),
  quantity: logger('quantity'),
  condition:logger('condition'),
  source:   logger('source'),
  value:    logger('value'),
  accept:   logger('accept'),
  handover: logger('handover'),
  ledger:   logger('ledger'),
  sync:     logger('sync'),
  db:       logger('db'),
  ref:      logger('reference'),
  api:      logger('api'),
  voice:    logger('voice'),
};

