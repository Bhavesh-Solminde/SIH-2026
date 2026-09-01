import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "./db.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

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

  // Routers are mounted here as each task lands:
  //   task  9-11  ./routes/sync.js       -> /sync
  //   task 12     ./routes/auth.js       -> /auth
  //   task 13-14  ./routes/recycler.js   -> /recycler
  //   task 15-16  ./routes/lots.js       -> /lots, /handover
  //   task 17     ./routes/handover.js   -> /handover/:lot_id/confirm
  //   task 18     ./routes/photos.js     -> /photos
  //   task 20     ./routes/detect.js     -> /detect-run

  app.use((_req, res) => res.status(404).json({ error: "not_found" }));

  // Four-arity signature is required — Express identifies error middleware by
  // parameter count, and dropping `next` makes this handler never fire.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.code === "P2002") return res.status(409).json({ error: "conflict", detail: err.meta });
    if (err?.status) return res.status(err.status).json({ error: err.code ?? "error", detail: err.message });
    console.error(err);
    res.status(500).json({ error: "internal" });
  });

  return app;
}
