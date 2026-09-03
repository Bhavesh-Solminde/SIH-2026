import { log } from "./logger.js";

/**
 * callPredict — calls the deployed Vercel ML model at /predict.
 *
 * Payload: { reference_price, buyer_offer_per_kg, final_price_per_kg, condition }
 * Response: { anomaly, score, threshold, risk_level, features }
 *
 * FAIL-OPEN: errors return { ok: false } — caller must not block transactions.
 */
export async function callPredict(payload, { url, timeoutMs } = {}) {
  const base = url ?? process.env.AIML_URL ?? "https://sihmodel.vercel.app";
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
 * callDetect — legacy: calls the local Python /detect endpoint.
 * Kept for backward compatibility. New code should use callPredict.
 */
export async function callDetect(payload, { url = process.env.AIML_URL, timeoutMs } = {}) {
  if (!url) {
    log.aiml.warn("callDetect: AIML_URL not configured");
    return { ok: false, reason: "AIML_URL is not configured" };
  }

  const ms = Number(timeoutMs ?? process.env.AIML_TIMEOUT_MS ?? 2000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  log.aiml.debug("callDetect →", { url: `${url}/detect` });

  try {
    const res = await fetch(`${url}/detect`, {
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
