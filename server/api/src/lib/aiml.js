import { log } from "./logger.js";

// A configured value that already ends in /predict would produce
// ".../predict/predict" — a 404 that callPredict then swallows, because it
// fails open. Normalise it away instead: pasting the full endpoint URL into
// the env var is the obvious mistake to make, and it is invisible when it
// happens.
const trimBase = (value, path) =>
  value?.replace(/\/+$/, "").replace(new RegExp(`${path}$`), "") ?? null;

const PREDICT_BASE = () =>
  trimBase(process.env.AIML_PREDICT_URL ?? process.env.AIML_URL ?? "https://sihmodel.vercel.app", "/predict");

/**
 * callPredict — calls the deployed Vercel ML model at /predict.
 *
 * Payload: { reference_price, buyer_offer_per_kg, final_price_per_kg, condition }
 * Response: { anomaly, score, threshold, risk_level, features }
 *
 * This is the ONLY anomaly source the live product uses. The eleven
 * rule-based pattern detectors (D1-D13, server/aiml's FastAPI /detect
 * endpoint) are no longer called from here — see AI.md §9 and
 * AI-ANOMALY-SPEC.md §0.1 for the superseded note, and entityAnomaly.js for
 * what replaced them: this model's per-transaction verdict, aggregated per
 * recycler/collector.
 *
 * FAIL-OPEN: errors return { ok: false } — caller must not block transactions.
 */
export async function callPredict(payload, { url, timeoutMs } = {}) {
  const base = url ?? PREDICT_BASE();
  const ms = Number(timeoutMs ?? process.env.AIML_TIMEOUT_MS ?? 4000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  log.aiml.debug("callPredict →", { url: `${base}/predict`, payload });

  try {
    const res = await fetch(`${base}/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.aiml.warn("callPredict: model error", { status: res.status });
      return { ok: false, reason: `model responded ${res.status}` };
    }

    const body = await res.json();
    log.aiml.info("callPredict ←", { anomaly: body.anomaly, score: body.score, risk_level: body.risk_level });
    return { ok: true, body };
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${ms}ms` : err.message;
    log.aiml.warn("callPredict: fetch failed", { reason });
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
