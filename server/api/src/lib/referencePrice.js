import { prisma } from "../db.js";

const SOURCE_NAME = "Metal Mandi";

export async function getReferencePrice(categoryCode) {
  const mapping = await prisma.categoryReferencePrice.findUnique({
    where: { categoryCode },
    include: { resolvedSource: true },
  });

  if (!mapping) {
    return {
      categoryCode,
      price: null,
      unit: null,
      status: "UNRESOLVED",
      source: null,
    };
  }

  const price =
    mapping.status === "RESOLVED" && mapping.resolvedSource
      ? Number(mapping.resolvedSource.referencePrice)
      : null;

  return {
    categoryCode,
    price,
    unit: mapping.unit,
    status: mapping.status,
    source: SOURCE_NAME,
  };
}

export async function getReferencePriceSource(categoryCode) {
  const mapping = await prisma.categoryReferencePrice.findUnique({
    where: { categoryCode },
    select: {
      status: true,
      resolvedRefId: true,
      candidateSourceRefIds: true,
    },
  });

  if (!mapping) return null;

  if (mapping.status === "RESOLVED") {
    const resolved = mapping.resolvedRefId
      ? await prisma.metalMandiReferencePrice.findUnique({
        where: { referenceId: mapping.resolvedRefId },
      })
      : null;

    return { status: "RESOLVED", resolved };
  }

  if (mapping.status === "AMBIGUOUS") {
    const candidates = mapping.candidateSourceRefIds.length
      ? await prisma.metalMandiReferencePrice.findMany({
        where: { referenceId: { in: mapping.candidateSourceRefIds } },
      })
      : [];

    return { status: "AMBIGUOUS", candidates };
  }

  return { status: "UNRESOLVED", candidates: [] };
}
