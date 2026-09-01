import { Router } from "express";
import { prisma } from "../db.js";

export const lotsRouter = Router();

// GET /lots/:reference_code — QR lookup
// Returns lot with category, collector pseudonym, and photos.
// No auth required: the QR is scanned at the physical handover point.
lotsRouter.get("/:reference_code", async (req, res, next) => {
  try {
    const { reference_code } = req.params;

    const handover = await prisma.handover.findUnique({
      where: { referenceCode: reference_code },
      include: {
        lot: {
          include: {
            category: {
              select: {
                code: true,
                nameEn: true,
                nameMr: true,
                nameHi: true,
                defaultUnit: true,
              },
            },
            collector: { select: { id: true, operatingArea: true } },
            photos: {
              where: { kind: "LOT" },
              select: { id: true, sha256: true, bytes: true, uploadedAt: true },
            },
          },
        },
      },
    });

    if (!handover) {
      return res.status(404).json({ error: "not_found" });
    }

    const lot = handover.lot;
    return res.json({
      reference_code: handover.referenceCode,
      handover_status: handover.status,
      lot: {
        id: lot.id,
        unit: lot.unit,
        quantity: lot.quantity,
        condition: lot.condition,
        estimated_value: lot.estimatedValue,
        collection_ts: lot.collectionTs,
        category: lot.category,
        collector: {
          pseudonym: lot.collector.id.slice(0, 8),
          operating_area: lot.collector.operatingArea,
        },
        photos: lot.photos,
      },
    });
  } catch (err) {
    return next(err);
  }
});
