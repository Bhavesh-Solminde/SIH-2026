import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { buildDetectPayload } from "../lib/history.js";
import { callDetect } from "../lib/aiml.js";
import { log } from "../lib/logger.js";

export const detectRouter = Router();

detectRouter.use(requireSession);

const SUBJECT_TYPES = ["LOT", "HANDOVER", "RECYCLER", "COLLECTOR", "MARKET"];
const SEVERITIES = ["INFO", "WARN", "CRITICAL"];

detectRouter.post("/", async (req, res, next) => {
  try {
    const asOf = req.body?.asOf ?? new Date().toISOString();
    log.detect.info("detect run started", { asOf, recycler: req.recycler.id });

    const payload = await buildDetectPayload(prisma, { asOf });
    log.detect.debug("payload built", { run_id: payload.run_id });

    const result = await callDetect(payload, { timeoutMs: req.body?.timeoutMs });

    if (!result.ok) {
      log.detect.warn("fail-open: detector service unavailable", { reason: result.reason });
      return res.json({
        runId: payload.run_id,
        status: "pending",
        reason: result.reason,
        detectorsRun: [],
        detectorsSkipped: [],
        flagsWritten: 0,
        flagsRejected: [],
      });
    }

    const body = result.body;
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
          runId: body.run_id ?? payload.run_id,
        },
        select: { id: true },
      });
      if (existing) {
        log.detect.debug("flag skipped: duplicate", { detector: flag.detector_code, subject: flag.subject_id });
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
          runId: body.run_id ?? payload.run_id,
        },
      });
      log.detect.info("flag written", { id: saved.id, detector: flag.detector_code, severity: flag.severity });
      written.push(saved);
    }

    log.detect.info("detect run complete", { flagsWritten: written.length, flagsRejected: rejected.length });

    return res.json({
      runId: body.run_id ?? payload.run_id,
      status: "ok",
      detectorsRun: body.detectors_run ?? [],
      detectorsSkipped: body.detectors_skipped ?? [],
      flagsWritten: written.length,
      flagsRejected: rejected,
    });
  } catch (err) {
    log.detect.error("detect run error", err);
    return next(err);
  }
});
