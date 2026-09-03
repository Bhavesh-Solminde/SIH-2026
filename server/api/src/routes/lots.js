import { Router } from "express";
import { prisma } from "../db.js";

export const lotsRouter = Router();

// Crockford Base32 alphabet — must match packages/core/src/ids.js
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Decode an 8-char Crockford Base32 reference code → 10-char lowercase hex suffix.
// Returns null on invalid input so callers can 404 cleanly.
function decodeRefCode(code) {
  if (typeof code !== "string" || code.length !== 8) return null;
  try {
    let bits = 0n;
    for (const c of code.toUpperCase()) {
      const idx = ALPHABET.indexOf(c);
      if (idx === -1) return null;
      bits = (bits << 5n) | BigInt(idx);
    }
    // 8 × 5 bits = 40 bits = 5 bytes = 10 hex chars
    return bits.toString(16).padStart(10, "0");
  } catch {
    return null;
  }
}

const LOT_INCLUDE = {
  category: {
    select: { code: true, nameEn: true, nameMr: true, nameHi: true, defaultUnit: true },
  },
  collector: { select: { id: true, operatingArea: true } },
  photos: {
    where: { kind: "LOT" },
    select: { id: true, sha256: true, bytes: true, uploadedAt: true },
  },
  acceptances: {
    select: { acceptedRate: true, acceptedUnit: true, recyclerResponse: true },
    orderBy: { acceptedTs: "desc" },
    take: 1,
  },
};

function formatLot(lot, handoverStatus = null, refCode = null) {
  const latestAcceptance = lot.acceptances?.[0] ?? null;
  return {
    id: lot.id,
    unit: lot.unit,
    quantity: lot.quantity,
    condition: lot.condition,
    estimated_value: lot.estimatedValue,
    accepted_rate: latestAcceptance ? Number(latestAcceptance.acceptedRate) : null,
    accepted_unit: latestAcceptance?.acceptedUnit ?? null,
    collection_ts: lot.collectionTs,
    category: lot.category,
    collector: lot.collector
      ? { pseudonym: lot.collector.id.slice(0, 8), operating_area: lot.collector.operatingArea }
      : null,
    photos: lot.photos ?? [],
  };
}

// GET /lots/:reference_code — QR lookup
// Returns lot details with accepted rate. Works before AND after a handover exists.
// No auth required: the QR is scanned at the physical handover point.
lotsRouter.get("/:reference_code", async (req, res, next) => {
  try {
    const { reference_code } = req.params;

    // Phase A: handover already exists → use it (fastest path, indexed lookup)
    const handover = await prisma.handover.findUnique({
      where: { referenceCode: reference_code },
      include: { lot: { include: LOT_INCLUDE } },
    });

    if (handover) {
      return res.json({
        reference_code: handover.referenceCode,
        handover_status: handover.status,
        lot: formatLot(handover.lot),
      });
    }

    // Phase B: no handover yet — decode ref code → hex suffix → lot lookup.
    // referenceCodeFromUuid() encodes last 10 hex chars of the stripped UUID.
    const hexSuffix = decodeRefCode(reference_code);
    if (!hexSuffix) {
      return res.status(404).json({ error: "not_found" });
    }

    // Postgres: right(replace(id::text, '-', ''), 10) = hexSuffix
    const rows = await prisma.$queryRaw`
      SELECT id FROM lot
      WHERE right(replace(id::text, '-', ''), 10) = lower(${hexSuffix})
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(404).json({ error: "not_found" });
    }

    const lot = await prisma.lot.findUnique({
      where: { id: rows[0].id },
      include: LOT_INCLUDE,
    });

    if (!lot) return res.status(404).json({ error: "not_found" });

    return res.json({
      reference_code,
      handover_status: null,
      lot: formatLot(lot),
    });
  } catch (err) {
    return next(err);
  }
});

// POST /lots/:lot_id/depart — collector marks an ACCEPTED lot as IN_TRANSIT.
// Called when the collector leaves their site and heads to the recycler facility.
// device_id in the body guards against another device spoofing the transition.
lotsRouter.post("/:lot_id/depart", async (req, res, next) => {
  try {
    const { lot_id } = req.params;
    const { device_id } = req.body ?? {};

    const lot = await prisma.lot.findUnique({ where: { id: lot_id } });
    if (!lot) return res.status(404).json({ error: "not_found" });
    if (lot.status !== "ACCEPTED") {
      return res.status(409).json({ error: "invalid_status", current: lot.status });
    }
    if (device_id && lot.deviceId !== device_id) {
      return res.status(403).json({ error: "forbidden" });
    }

    const updated = await prisma.lot.update({
      where: { id: lot_id },
      data: { status: "IN_TRANSIT" },
    });

    return res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    return next(err);
  }
});
