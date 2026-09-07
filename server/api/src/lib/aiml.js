import { log } from "./logger.js";

/**
 * Two ML services, two URLs. They are NOT interchangeable and a single
 * AIML_URL cannot serve both:
 *
 *   PREDICT  — the deployed model, POST /predict. Single-transaction price
 *              scoring. Fires automatically on every handover.
 *   DETECT   — server/aiml (FastAPI), POST /detect. The eleven pattern
 *              detectors from AI.md. Needs a whole history, not one row.
 *
 * Pointing both at one host silently 404s whichever route that host lacks,
 * and the failure is invisible because both callers fail open.
 */
const PREDICT_BASE = () =>
  process.env.AIML_PREDICT_URL ?? process.env.AIML_URL ?? "https://sihmodel.vercel.app";
const DETECT_BASE = () =>
  process.env.AIML_DETECT_URL ?? process.env.AIML_URL ?? null;

/**
 * callPredict — calls the deployed Vercel ML model at /predict.
 *
 * Payload: { reference_price, buyer_offer_per_kg, final_price_per_kg, condition }
 * Response: { anomaly, score, threshold, risk_level, features }
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

/**
 * callDetect — calls server/aiml POST /detect, the eleven pattern detectors.
 *
 * This is the detector suite AI.md describes; it is NOT the same service as
 * callPredict. FAIL-OPEN: a detector outage must never block a sale.
 */
export async function callDetect(payload, { url, timeoutMs } = {}) {
  const base = url ?? DETECT_BASE();
  if (!base) {
    log.aiml.warn("callDetect: AIML_DETECT_URL not configured");
    return { ok: false, reason: "AIML_DETECT_URL is not configured" };
  }

  const ms = Number(timeoutMs ?? process.env.AIML_TIMEOUT_MS ?? 2000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  log.aiml.debug("callDetect →", { url: `${base}/detect` });

  try {
    const res = await fetch(`${base}/detect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.aiml.warn("callDetect: aiml error", { status: res.status });
      return { ok: false, reason: `aiml responded ${res.status}` };
    }

    const body = await res.json();
    log.aiml.info("callDetect ←", { flags: body.flags?.length ?? 0 });
    return { ok: true, body };
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${ms}ms` : err.message;
    log.aiml.warn("callDetect: fetch failed", { reason });
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
