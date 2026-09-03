import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "./db.js";
import { syncRouter } from "./routes/sync.js";
import { authRouter } from "./routes/auth.js";
import { recyclerRouter } from "./routes/recycler.js";
import { lotsRouter } from "./routes/lots.js";
import { handoverRouter } from "./routes/handover.js";
import { photosRouter } from "./routes/photos.js";
import { detectRouter } from "./routes/detect.js";
import { publicRouter } from "./routes/public.js";
import { log } from "./lib/logger.js";

// Allowed browser origins
const ALLOWED_ORIGINS = new Set([
  process.env.CONSOLE_ORIGIN ?? "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:19006",
  "http://192.168.0.102:3000",
]);

export function createApp() {
  const app = express();

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Cookie");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  // ── Request logger ───────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const start = Date.now();
    const hasCookie = !!req.cookies?.bhaav_session;
    res.on("finish", () => {
      const ms = Date.now() - start;
      const s = res.statusCode;
      const level = s >= 500 ? "error" : s >= 400 ? "warn" : "info";
      log.req[level](`${req.method} ${req.path} → ${s}`, {
        ms,
        cookie: hasCookie,
        ip: req.ip,
        ...(s >= 400 && req.body && Object.keys(req.body).length
          ? { body: sanitize(req.body) }
          : {}),
      });
    });
    next();
  });

  // ── Health ───────────────────────────────────────────────────────────────
  app.get("/health", async (_req, res) => {
    let db = "error";
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "ok";
    } catch {
      db = "error";
    }
    res.json({ status: db === "ok" ? "ok" : "degraded", db, aiml: process.env.AIML_URL ?? null });
  });

  // Routers mounted as each task lands:
  app.use("/sync", syncRouter);       // tasks 9-11
  app.use("/auth", authRouter);       // task 12
  app.use("/recycler", recyclerRouter); // tasks 13-14, 19, 21
  app.use("/lots", lotsRouter);       // task 15
  app.use("/handover", handoverRouter); // tasks 16-17
  app.use("/photos", photosRouter);   // task 18
  app.use("/detect-run", detectRouter); // task 20
  app.use("/public", publicRouter);     // collector app — no auth

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));

  // Four-arity signature required — Express identifies error middleware by arity.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    log.req.error("unhandled error", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "conflict", detail: err.meta });
    if (err?.status) return res.status(err.status).json({ error: err.code ?? "error", detail: err.message });
    res.status(500).json({ error: "internal" });
  });

  return app;
}

// Strip sensitive fields from logged request bodies
function sanitize(body) {
  const out = { ...body };
  for (const k of ["password", "passwordHash", "token", "secret"]) delete out[k];
  return out;
}
