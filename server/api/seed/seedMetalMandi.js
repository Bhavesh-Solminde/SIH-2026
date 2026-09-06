import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { METAL_MANDI_CATEGORY_MAP } from "./metalMandiCategoryMap.js";

// The reference-price CSV lives in server/, two levels above this seed file.
const CSV_PATH = fileURLToPath(
  new URL("../../metal_mandi_reference_prices.csv", import.meta.url),
);

const REQUIRED_COLUMNS = [
  "reference_id", "Category", "Item", "Specification", "Unit",
  "reference_price", "price_change_pct", "critical_materials",
];

function validateColumns(rows) {
  if (rows.length === 0) {
    throw new Error("metal_mandi_reference_prices.csv has no rows");
  }
  const actual = new Set(Object.keys(rows[0]));
  const missing = REQUIRED_COLUMNS.filter((c) => !actual.has(c));
  if (missing.length) {
    throw new Error(`metal_mandi_reference_prices.csv is missing columns: ${missing.join(", ")}`);
  }
}

function parseCriticalMaterials(raw) {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * seedRawRows — CSV -> MetalMandiReferencePrice, one row per line item.
 * Idempotent: keyed by the CSV's own reference_id via upsert, so re-running
 * the seed updates existing rows in place instead of duplicating them.
 */
async function seedRawRows(prisma) {
  const rows = parse(readFileSync(CSV_PATH, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  validateColumns(rows);

  let count = 0;
  for (const row of rows) {
    if (!row.reference_id) {
      throw new Error(`row for item "${row.Item}" is missing reference_id — cannot import without it`);
    }
    await prisma.metalMandiReferencePrice.upsert({
      where: { referenceId: row.reference_id },
      update: {
        category: row.Category,
        item: row.Item,
        specification: row.Specification || null,
        unit: row.Unit,
        referencePrice: row.reference_price,
        priceChangePct: row.price_change_pct || null,
        criticalMaterials: parseCriticalMaterials(row.critical_materials),
      },
      create: {
        referenceId: row.reference_id,
        category: row.Category,
        item: row.Item,
        specification: row.Specification || null,
        unit: row.Unit,
        referencePrice: row.reference_price,
        priceChangePct: row.price_change_pct || null,
        criticalMaterials: parseCriticalMaterials(row.critical_materials),
      },
    });
    count++;
  }
  return { rowsInFile: rows.length, imported: count };
}

/**
 * seedCategoryMapping — writes the classification from
 * metalMandiCategoryMap.js into CategoryReferencePrice.
 *
 * Only RESOLVED entries get a non-null `price`, and only when they carry a
 * `resolvedRefId` that actually exists in MetalMandiReferencePrice (checked
 * below, not assumed) — this is what makes the traceability requirement
 * enforceable rather than just documented in comments.
 */
async function seedCategoryMapping(prisma) {
  let resolved = 0, ambiguous = 0, unresolved = 0;

  for (const [categoryCode, mapping] of Object.entries(METAL_MANDI_CATEGORY_MAP)) {
    if (mapping.status === "RESOLVED") {
      if (!mapping.resolvedRefId) {
        throw new Error(`${categoryCode} is marked RESOLVED but has no resolvedRefId`);
      }
      const source = await prisma.metalMandiReferencePrice.findUnique({
        where: { referenceId: mapping.resolvedRefId },
      });
      if (!source) {
        throw new Error(
          `${categoryCode} references ${mapping.resolvedRefId}, which is not in ` +
          `metal_mandi_reference_price — run seedRawRows first, or fix the ref id`,
        );
      }
      resolved++;
    } else if (mapping.status === "AMBIGUOUS") {
      ambiguous++;
    } else {
      unresolved++;
    }

    await prisma.categoryReferencePrice.upsert({
      where: { categoryCode },
      update: {
        status: mapping.status,
        unit: mapping.unit,
        price: mapping.status === "RESOLVED" ? mapping.price : null,
        resolvedRefId: mapping.status === "RESOLVED" ? mapping.resolvedRefId : null,
        candidateSourceRefIds: mapping.candidateSourceRefIds ?? [],
        notes: mapping.notes ?? null,
      },
      create: {
        categoryCode,
        status: mapping.status,
        unit: mapping.unit,
        price: mapping.status === "RESOLVED" ? mapping.price : null,
        resolvedRefId: mapping.status === "RESOLVED" ? mapping.resolvedRefId : null,
        candidateSourceRefIds: mapping.candidateSourceRefIds ?? [],
        notes: mapping.notes ?? null,
      },
    });
  }

  return { resolved, ambiguous, unresolved };
}

export async function seedMetalMandi(prisma) {
  const raw = await seedRawRows(prisma);
  const mapping = await seedCategoryMapping(prisma);

  console.log(
    `[seedMetalMandi] ${raw.imported}/${raw.rowsInFile} CSV rows imported. ` +
    `Category mapping: ${mapping.resolved} RESOLVED, ${mapping.ambiguous} ` +
    `AMBIGUOUS, ${mapping.unresolved} UNRESOLVED.`,
  );

  return { raw, mapping };
}

// Run directly: `node seed/seedMetalMandi.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await seedMetalMandi(prisma);
  await prisma.$disconnect();
}

// To wire into the existing prisma/seed.js entrypoint alongside seedAll():
//   import { seedMetalMandi } from "./seedMetalMandi.js";
//   ...
//   await seedMetalMandi(prisma);
// Running the whole seed (or this file alone) twice is safe — every write
// is an upsert keyed on a stable identifier (reference_id, categoryCode).
