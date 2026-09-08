import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "./db.js";
import { syncRouter } from "./routes/sync.js";
import { authRouter } from "./routes/auth.js";
import { recyclerRouter } from "./routes/recycler.js";
import { lotsRouter } from "./routes/lots.js";
import { handoverRouter } from "./routes/handover.js";
import { photosRouter } from "./routes/photos.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { collectorReportsRouter } from "./routes/collectorReports.js";
import { recyclerBadgeRouter } from "./routes/recyclerBadge.js";
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

  // ── No ETags ─────────────────────────────────────────────────────────────
  // Express sends an ETag on every JSON response by default, so a repeat
  // request carries If-None-Match and gets a bodyless 304. A browser handles
  // that from its own HTTP cache; React Native's fetch does not implement one,
  // so the 304 arrives with nothing to revalidate against and the promise
  // REJECTS with "Network request failed" — indistinguishable, in the app log,
  // from the phone having no route to the server at all.
  //
  // That cost real debugging time: the API log showed a healthy run of 304s
  // while the collector app reported every fetch as a network failure.
  //
  // Conditional requests buy us nothing here anyway — the app keeps its own
  // AsyncStorage cache of rates and authorisation counts (see ValueScreen), and
  // these payloads are small. Always send a body.
  app.set("etag", false);

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
  // The rule-based detector run (D1-D13) that used to live at /detect-run was
  // dropped: anomaly detection is scoreHandover's deployed-model verdict,
  // aggregated per party in entityAnomaly.js. The console's manual re-check
  // now lives at POST /recycler/anomaly/recheck instead.
  app.use("/public", publicRouter);     // collector app — no auth
  // Cross-tenant admin queue and outcome write-back (AI-ANOMALY-SPEC.md
  // §3.3-3.4) — requireSession + requireAdmin gate every route inside.
  app.use("/admin", adminRouter);
  // Collector-initiated "something is wrong" reports — separate from
  // /handover/:lot_id/dispute, which refuses once the collector has already
  // confirmed. No auth, same as confirm/dispute.
  app.use("/reports", collectorReportsRouter);
  // Admin-only: list MPCB-verified recyclers and revoke/restore the green
  // login badge (GET /auth/me → mpcbVerified) independently of the
  // MPCB-derived authorizationStatus.
  app.use("/recyclers", recyclerBadgeRouter);

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
