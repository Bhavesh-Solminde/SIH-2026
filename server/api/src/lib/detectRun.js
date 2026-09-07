import { buildDetectPayload } from "./history.js";
import { callDetect } from "./aiml.js";
import { log } from "./logger.js";

// The flag vocabulary the API will persist. Anything outside it is rejected
// rather than stored, so a detector service change cannot silently widen the
// schema's effective enum.
const SUBJECT_TYPES = ["LOT", "HANDOVER", "RECYCLER", "COLLECTOR", "MARKET"];
const SEVERITIES = ["INFO", "WARN", "CRITICAL"];

/**
 * Run the eleven pattern detectors over the whole history and persist the flags.
 *
 * Extracted from routes/detect.js so it has two callers: the operator-triggered
 * route, and the post-handover-confirm path. A route handler cannot be invoked
 * from another route handler, and detection that only runs when a human POSTs to
 * an authenticated endpoint is, in a deployed configuration, detection that
 * never runs at all.
 *
 * FAIL-OPEN: a detector outage returns status "pending" with a reason. It never
 * throws for an unavailable service, because callers include a transaction path
 * that must not be blocked.
 */
export async function runDetection(prisma, { asOf, timeoutMs } = {}) {
  const at = asOf ?? new Date().toISOString();
  const payload = await buildDetectPayload(prisma, { asOf: at });
  log.detect.debug("payload built", { run_id: payload.run_id });

  const result = await callDetect(payload, { timeoutMs });

  if (!result.ok) {
    log.detect.warn("fail-open: detector service unavailable", { reason: result.reason });
    return {
      runId: payload.run_id,
      status: "pending",
      reason: result.reason,
      detectorsRun: [],
      detectorsSkipped: [],
      flagsWritten: 0,
      flagsRejected: [],
    };
  }

  const body = result.body;
  const runId = body.run_id ?? payload.run_id;
  const written = [];
  const rejected = [];

  for (const flag of body.flags ?? []) {
    if (!SUBJECT_TYPES.includes(flag.subject_type) || !SEVERITIES.includes(flag.severity)) {
      log.detect.warn("flag rejected: bad vocab", { flag });
      rejected.push({ flag, reason: "subject_type or severity outside the vocabulary" });
      continue;
    }

    const existing = await prisma.anomalyFlag.findFirst({
      where: {
        detectorCode: flag.detector_code,
        subjectType: flag.subject_type,
        subjectId: flag.subject_id,
        runId,
      },
      select: { id: true },
    });
    if (existing) {
      log.detect.debug("flag skipped: duplicate", {
        detector: flag.detector_code,
        subject: flag.subject_id,
      });
      continue;
    }

    const saved = await prisma.anomalyFlag.create({
      data: {
        subjectType: flag.subject_type,
        subjectId: flag.subject_id,
        detectorCode: flag.detector_code,
        severity: flag.severity,
        detail: flag.detail ?? {},
        configVersion: body.config_version ?? null,
        runId,
      },
    });
    log.detect.info("flag written", {
      id: saved.id,
      detector: flag.detector_code,
      severity: flag.severity,
    });
    written.push(saved);
  }

  log.detect.info("detect run complete", {
    flagsWritten: written.length,
    flagsRejected: rejected.length,
  });

  return {
    runId,
    status: "ok",
    detectorsRun: body.detectors_run ?? [],
    detectorsSkipped: body.detectors_skipped ?? [],
    flagsWritten: written.length,
    flagsRejected: rejected,
  };
}
