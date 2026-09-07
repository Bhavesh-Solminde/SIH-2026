import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { runDetection } from "../lib/detectRun.js";
import { log } from "../lib/logger.js";

export const detectRouter = Router();

detectRouter.use(requireSession);

detectRouter.post("/", async (req, res, next) => {
  try {
    const asOf = req.body?.asOf ?? new Date().toISOString();
    log.detect.info("detect run started", { asOf, recycler: req.recycler.id });

    const result = await runDetection(prisma, {
      asOf,
      timeoutMs: req.body?.timeoutMs,
    });

    return res.json(result);
  } catch (err) {
    log.detect.error("detect run error", err);
    return next(err);
  }
});
