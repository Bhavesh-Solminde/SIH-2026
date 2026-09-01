import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "./db.js";
import { syncRouter } from "./routes/sync.js";
import { authRouter } from "./routes/auth.js";
import { recyclerRouter } from "./routes/recycler.js";
import { lotsRouter } from "./routes/lots.js";
import { handoverRouter } from "./routes/handover.js";

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

  // Routers mounted as each task lands:
  app.use("/sync", syncRouter);       // tasks 9-11
  app.use("/auth", authRouter);       // task 12
  app.use("/recycler", recyclerRouter); // tasks 13-14
  app.use("/lots", lotsRouter);       // task 15
  app.use("/handover", handoverRouter); // tasks 16-17
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
