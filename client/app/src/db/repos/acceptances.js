import { uuidv7 } from "@bhaav/core/ids";
import { enqueue } from "./outbox.js";
import { setLotStatus } from "./lots.js";

/**
 * accepted_rate is FROZEN here (DB.md 1.3). We store the number, never a
 * pointer to the rate row: if it were looked up later, what the collector was
 * promised could never be reconstructed, and the three-price model collapses.
 */
export async function createAcceptance(db, { lotId, recyclerId, rate, unit, acceptedTs }) {
  const id = uuidv7();
  const ts = acceptedTs ?? new Date().toISOString();
  const payload = {
    id,
    lot_id: lotId,
    recycler_id: recyclerId,
    accepted_rate: rate,
    accepted_unit: unit,
    accepted_ts: ts,
    recycler_response: "NONE",
  };

  await db.$transaction(async (tx) => {
    await tx.acceptance.create({
      data: {
        id,
        lotId,
        recyclerId,
        acceptedRate: rate,
        acceptedUnit: unit,
        acceptedTs: ts,
        recyclerResponse: "NONE",
        createdAt: new Date().toISOString(),
      },
    });
    await setLotStatus(tx, lotId, "ACCEPTED");
    await enqueue(tx, "acceptance", id, payload);
  });

  return { id, ...payload };
}

export async function acceptanceForLot(db, lotId) {
  return db.acceptance.findFirst({ where: { lotId }, orderBy: { acceptedTs: "desc" } });
}
