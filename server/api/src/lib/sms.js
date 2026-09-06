import { logger } from "./logger.js";

/**
 * Fast2SMS sender. Modelled on lib/aiml.js: every failure is returned, never
 * thrown, because every caller is a fire-and-forget side effect on a request
 * path that must not be blocked by a third party.
 *
 * Route "q" (Quick SMS) is used deliberately: it needs no DLT registration,
 * which is a weeks-long process requiring a registered legal entity. DLT is the
 * production path and is out of scope here.
 *
 * THREE INDEPENDENT SAFETY GUARDS, because the numbers in this database are
 * real businesses on a government register and an accidental broadcast is a
 * real-world harm, not a test failure:
 *   1. SMS_ENABLED must be explicitly "true"
 *   2. SMS_ALLOWLIST, when set, is the ONLY set of numbers that can receive
 *   3. SMS_DRY_RUN logs what would be sent and touches no network
 *
 * Note: the pre-built `log` export in ./logger.js has no `sms` namespace
 * (only req/auth/recycler/handover/sync/detect/aiml/db exist there, and this
 * module's ownership boundary doesn't extend to adding one). The logger
 * module already exports a generic `logger(namespace)` factory for exactly
 * this case — used here instead of inventing an ad-hoc console call.
 */
const log = logger("sms");

const BASE = "https://www.fast2sms.com/dev/bulkV2";

export function smsEnabled() {
  return process.env.SMS_ENABLED === "true";
}

function allowlist() {
  const raw = process.env.SMS_ALLOWLIST;
  if (!raw) return null;
  return new Set(raw.split(",").map((n) => n.trim()).filter(Boolean));
}

function redact(text, key) {
  if (!key || !text) return text;
  return String(text).split(key).join("<redacted>");
}

export async function sendSms({ numbers, message }) {
  const key = process.env.FAST2SMS_API_KEY;

  if (!smsEnabled()) return { ok: false, reason: "SMS_ENABLED is not true" };
  if (!key) return { ok: false, reason: "FAST2SMS_API_KEY is not configured" };

  const requested = String(numbers ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  const allow = allowlist();
  const permitted = allow ? requested.filter((n) => allow.has(n)) : requested;

  if (permitted.length === 0) {
    return { ok: false, reason: allow ? "every number filtered by SMS_ALLOWLIST" : "no numbers" };
  }

  if (process.env.SMS_DRY_RUN === "true") {
    log.info("dry-run", { to: permitted.join(","), message });
    return { ok: true, dryRun: true, to: permitted };
  }

  const url = `${BASE}?route=q&message=${encodeURIComponent(message)}&numbers=${encodeURIComponent(permitted.join(","))}`;
  const ms = Number(process.env.SMS_TIMEOUT_MS ?? 3000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: key },
      signal: controller.signal,
    });

    if (!res.ok) return { ok: false, reason: `fast2sms responded ${res.status}` };

    const body = await res.json();
    return { ok: true, body, to: permitted };
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${ms}ms` : err.message;
    return { ok: false, reason: redact(reason, key) };
  } finally {
    clearTimeout(timer);
  }
}
