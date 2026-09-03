/**
 * Central logger for the Bhaav console (Next.js).
 *
 * Server-side (RSC / API routes): writes to process.stdout — visible in terminal.
 * Client-side: writes to browser console with structured groups.
 *
 * Usage:
 *   import { clog } from '@/lib/logger';
 *   clog.info('rates loaded', { count: rows.length });
 *   clog.error('fetch failed', err);
 */

const IS_SERVER = typeof window === "undefined";
const IS_DEV = process.env.NODE_ENV !== "production";

function ts() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function serverWrite(level, ns, msg, meta) {
  const line = `[${ts()}] ${level.toUpperCase().padEnd(5)} [console/${ns}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`;
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

function clientWrite(level, ns, msg, meta) {
  if (!IS_DEV) return;
  const prefix = `[${ts()}] [${ns}]`;
  const fn = level === "error" ? console.error
    : level === "warn" ? console.warn
    : level === "debug" ? console.debug
    : console.log;
  meta ? fn(prefix, msg, meta) : fn(prefix, msg);
}

function write(level, ns, msg, meta) {
  if (IS_SERVER) serverWrite(level, ns, msg, meta);
  else clientWrite(level, ns, msg, meta);
}

function makeLogger(ns) {
  return {
    debug: (msg, meta) => write("debug", ns, msg, meta),
    info:  (msg, meta) => write("info",  ns, msg, meta),
    warn:  (msg, meta) => write("warn",  ns, msg, meta),
    error: (msg, meta) => write("error", ns, msg, meta),
  };
}

export const clog = {
  auth:     makeLogger("auth"),
  rates:    makeLogger("rates"),
  accept:   makeLogger("accept"),
  verify:   makeLogger("verify"),
  history:  makeLogger("history"),
  flags:    makeLogger("flags"),
  api:      makeLogger("api"),
};
