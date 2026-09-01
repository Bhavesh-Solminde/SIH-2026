import { uuidv7 } from "@bhaav/core/ids";
import { enqueue } from "./outbox.js";

/**
 * The photo's job is the record: it is evidence of what physically existed,
 * and it is written to local storage BEFORE anything else happens
 * (FRONTEND.md S1). uploaded_at stays NULL until the file itself syncs, which
 * is normal and not an error — a record is valid before its photograph has
 * arrived (DB.md 3.8).
 */
export async function savePhoto(db, { lotId, kind, uri, sha256, bytes }) {
  const id = uuidv7();
  await db.$transaction(async (tx) => {
    await tx.photo.create({
      data: {
        id,
        lotId,
        kind,
        localUri: uri,
        sha256,
        bytes,
        uploadedAt: null,
        createdAt: new Date().toISOString(),
      },
    });
    await enqueue(tx, "photo", id, { id, lot_id: lotId, kind, sha256, bytes });
  });
  return { id, lotId, kind, uri, sha256, bytes };
}

export async function photosForLot(db, lotId) {
  return db.photo.findMany({ where: { lotId }, orderBy: { createdAt: "asc" } });
}

export async function markPhotoUploaded(db, id) {
  await db.photo.update({ where: { id }, data: { uploadedAt: new Date().toISOString() } });
}
