/**
 * T18 — POST /photos  · GET /photos/:id
 *
 * Deferred multipart upload. The device generates the photo row (via sync/push)
 * before the file bytes ever arrive; uploaded_at being NULL is normal, not an
 * error (DB.md §3.8).
 *
 * sha256 gives integrity and free duplicate detection: the same photograph
 * reused across two lots is a fabrication signal (DB.md §3.8).
 *
 * File bytes are stored on disk under PHOTO_DIR (default ./uploads). The row
 * is upserted so re-uploading the same photoId is safe.
 */
import { Router } from "express";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import multer from "multer";
import { prisma } from "../db.js";

export const photosRouter = Router();

// In-memory storage: photos are compressed to roughly 200 KB on the device
// (FRONTEND.md S1), and holding one in RAM to verify its digest before it
// touches disk is simpler than cleaning up a rejected temp file.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const dir = () => resolve(process.env.PHOTO_DIR ?? "./uploads");

// ---------------------------------------------------------------------------
// POST /photos
// Multipart fields: file (binary), photoId, lotId, kind, sha256
// ---------------------------------------------------------------------------
photosRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const { photoId, lotId, kind, sha256 } = req.body ?? {};

    if (!req.file) {
      return res.status(400).json({ error: "bad_request", detail: "file is required" });
    }
    if (!["LOT", "HANDOVER"].includes(kind)) {
      return res.status(400).json({ error: "bad_request", detail: "kind must be LOT or HANDOVER" });
    }

    const lot = await prisma.lot.findUnique({
      where: { id: String(lotId ?? "") },
      select: { id: true },
    });
    if (!lot) return res.status(404).json({ error: "not_found", detail: "unknown lot" });

    // sha256 gives integrity and free duplicate detection: the same photograph
    // reused across two lots is a fabrication signal (DB.md 3.8), and D14
    // later builds on exactly this.
    const actual = createHash("sha256").update(req.file.buffer).digest("hex");
    if (actual !== String(sha256 ?? "").toLowerCase()) {
      return res.status(400).json({
        error: "bad_request",
        detail: `sha256 mismatch: declared ${sha256}, received ${actual}`,
      });
    }

    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), `${photoId}.bin`), req.file.buffer);

    const photo = await prisma.photo.upsert({
      where: { id: String(photoId) },
      update: { uploadedAt: new Date() },
      create: {
        id: String(photoId),
        lotId: lot.id,
        kind,
        sha256: actual,
        bytes: req.file.size,
        uploadedAt: new Date(),
      },
    });

    return res.status(201).json({
      photo: {
        id: photo.id,
        lotId: photo.lotId,
        kind: photo.kind,
        sha256: photo.sha256,
        bytes: photo.bytes,
        uploaded: photo.uploadedAt !== null,
        url: `/photos/${photo.id}`,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /photos/:id
// Serves the raw bytes for a photo whose file has been uploaded.
// ---------------------------------------------------------------------------
photosRouter.get("/:id", async (req, res, next) => {
  try {
    const photo = await prisma.photo.findUnique({ where: { id: String(req.params.id) } });
    if (!photo || !photo.uploadedAt) {
      return res.status(404).json({ error: "not_found" });
    }
    const bytes = await readFile(join(dir(), `${photo.id}.bin`));
    return res.type("image/jpeg").send(bytes);
  } catch (err) {
    if (err.code === "ENOENT") return res.status(404).json({ error: "not_found" });
    return next(err);
  }
});
