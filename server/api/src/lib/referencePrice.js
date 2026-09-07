import { prisma } from "../db.js";

// The external reference price for an app category — the Metal Mandi published
// scrap rate, imported by seed/seedMetalMandi.js.
//
// Only a category whose mapping is RESOLVED has a price. AMBIGUOUS and
// UNRESOLVED deliberately return null rather than a best-effort number: see
// seed/metalMandiCategoryMap.js for why each one is where it is. Callers must
// treat a null price as "no external reference exists" and fall back, not as
// "the reference is zero".
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

/**
 * The provenance behind a category's reference price — which CSV row it
 * resolved to, or which rows were candidates when it did not. This is what
 * makes a flagged price explainable to the recycler it was raised against.
 */
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
