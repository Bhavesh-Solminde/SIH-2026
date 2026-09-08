#!/usr/bin/env node
/**
 * Seed ~45 days of collector→recycler transaction history against the three
 * demo recyclers that already have published rates (seed/categories.js
 * DEMO_RATES: Lilashana Sales, Global E-Recycling, Eco Reset), each scored
 * through the REAL deployed price model (server/api/src/lib/scoreHandover.js
 * → https://sihmodel.vercel.app/predict) — never fabricated flags.
 *
 * Before this script ran, the demo database had zero scored handovers and
 * zero anomaly_flag rows: the admin queue and the recycler's own /flags page
 * had never had anything to show. This is additive-only — it never
 * TRUNCATEs or deletes anything (see .env's comments on why: a remote test
 * target once did exactly that to this same database).
 *
 * Usage:
 *   node --env-file=../../.env scripts/seed-demo-transactions.js --yes
 *   npm -w @bhaav/api run seed:demo -- --yes
 *
 * Idempotent: running it twice does not double up. The first run tags every
 * collector it creates with operatingArea "demo-seed-v1"; a second run finds
 * that marker and exits without creating anything new.
 */
import { prisma } from "../src/db.js";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { scoreHandover } from "../src/lib/scoreHandover.js";
import { refreshEntityFlagRate } from "../src/lib/entityAnomaly.js";

const MARKER = "demo-seed-v1";
const CATEGORY_CODES = ["CABLE", "PCB"];
const DAYS_OF_HISTORY = 45;
const HANDOVERS_PER_RECYCLER = 18;
const DOWNGRADE_REASONS_FOR_LOW_PAY = ["LOW_RECOVERABLE", "POOR_CONDITION"];

// Recycler name substrings (matches DEMO_RATES/DEMO_COORDS keys) →
// behaviour profile. Three profiles because that is what the ranked admin
// queue needs to demonstrate it grades severity rather than just listing:
// nothing wrong, marginal, and clearly over the line.
const PROFILES = {
  "Lilashana Sales": { label: "honest", underpayShare: 0.0, honestFactor: [0.95, 1.03] },
  "Eco Reset": { label: "mixed", underpayShare: 0.25, honestFactor: [0.9, 1.0] },
  "Global E-Recycling": { label: "systematic underpayer", underpayShare: 1.0, honestFactor: [0.9, 1.0] },
};
const UNDERPAY_FACTOR = [0.45, 0.68];

function rand(min, max) {
  return min + Math.random() * (max - min);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  const yes = process.argv.includes("--yes");
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/[/?].*$/, "");
  console.log(`Target database: ${host}`);

  if (!yes) {
    console.log("Refusing to write without --yes. Re-run as:");
    console.log("  node --env-file=../../.env scripts/seed-demo-transactions.js --yes");
    process.exit(1);
  }

  const existingMarker = await prisma.collector.findFirst({ where: { operatingArea: MARKER } });
  if (existingMarker) {
    console.log(`Marker collector (operatingArea="${MARKER}") already exists — this script already ran. `
      + "No changes made. Delete that collector manually first if you really want to reseed.");
    await prisma.$disconnect();
    return;
  }

  const categories = await prisma.category.findMany({
    where: { code: { in: CATEGORY_CODES } },
    select: { id: true, code: true, defaultUnit: true },
  });
  if (categories.length !== CATEGORY_CODES.length) {
    throw new Error(`Expected categories ${CATEGORY_CODES.join(",")} — run \`npm run seed\` first.`);
  }
  const categoryByCode = new Map(categories.map((c) => [c.code, c]));

  const recyclers = [];
  for (const namePart of Object.keys(PROFILES)) {
    const r = await prisma.recycler.findFirst({ where: { name: { contains: namePart } } });
    if (!r) throw new Error(`Expected a seeded demo recycler matching "${namePart}" — run \`npm run seed\` first.`);
    recyclers.push({ ...r, profile: PROFILES[namePart] });
  }

  // A handful of shared demo collectors — the story is about recycler
  // behaviour, not collector identity, so any collector can sell to any
  // recycler in this history.
  const collectors = [];
  for (let i = 0; i < 6; i++) {
    const c = await prisma.collector.create({
      data: {
        id: uuidv7(),
        preferredLanguage: "mr",
        operatingArea: i === 0 ? MARKER : `${MARKER}-${i}`,
      },
    });
    collectors.push(c);
  }

  const summary = [];

  for (const recycler of recyclers) {
    const rate = await prisma.rate.findFirst({
      where: { recyclerId: recycler.id, source: "RECYCLER_PUBLISHED" },
      orderBy: { validFrom: "desc" },
    });
    // Fall back across the two seeded categories if this recycler's most
    // recent published rate happens to be for the other one.
    let scored = 0;
    let anomalies = 0;

    for (let i = 0; i < HANDOVERS_PER_RECYCLER; i++) {
      const category = pick(categories);
      const recyclerRate = await prisma.rate.findFirst({
        where: { recyclerId: recycler.id, categoryId: category.id, source: "RECYCLER_PUBLISHED" },
        orderBy: { validFrom: "desc" },
      });
      if (!recyclerRate) continue; // this recycler doesn't publish this category — skip
      const publishedPrice = Number(recyclerRate.price);

      const collector = pick(collectors);
      const quantity = +rand(2, 9).toFixed(1);
      const collectionTs = daysAgo(rand(1, DAYS_OF_HISTORY));
      const acceptedTs = new Date(collectionTs.getTime() + rand(10, 90) * 60 * 1000);
      const handoverTs = new Date(acceptedTs.getTime() + rand(30, 180) * 60 * 1000);

      const lot = await prisma.lot.create({
        data: {
          id: uuidv7(),
          collectorId: collector.id,
          categoryId: category.id,
          unit: category.defaultUnit,
          quantity,
          condition: "GOOD", // what the collector declared
          sourceType: "HOUSEHOLD",
          estimatedValue: +(quantity * publishedPrice).toFixed(2),
          collectionTs,
          status: "HANDED_OVER",
          deviceId: `demo-seed-${collector.id.slice(0, 8)}`,
        },
      });

      await prisma.acceptance.create({
        data: {
          id: uuidv7(),
          lotId: lot.id,
          recyclerId: recycler.id,
          acceptedRate: publishedPrice.toFixed(2),
          acceptedUnit: category.defaultUnit,
          acceptedTs,
          recyclerResponse: "ACKNOWLEDGED",
          responseTs: acceptedTs,
        },
      });

      const isUnderpaid = Math.random() < recycler.profile.underpayShare;
      const factor = isUnderpaid ? rand(...UNDERPAY_FACTOR) : rand(...recycler.profile.honestFactor);
      const finalUnitPrice = +(publishedPrice * factor).toFixed(2);
      const finalTotal = +(finalUnitPrice * quantity).toFixed(2);
      const inspectedCondition = isUnderpaid ? "POOR" : "GOOD";
      const downgradeReasonCode = isUnderpaid ? pick(DOWNGRADE_REASONS_FOR_LOW_PAY) : null;

      const handover = await prisma.handover.create({
        data: {
          id: uuidv7(),
          lotId: lot.id,
          recyclerId: recycler.id,
          referenceCode: referenceCodeFromUuid(lot.id),
          inspectedQuantity: quantity,
          finalUnitPrice,
          finalTotal,
          buyerOfferSnapshot: publishedPrice,
          buyerOfferUnit: category.defaultUnit,
          inspectedCondition,
          downgradeReasonCode,
          handoverTs,
          recyclerConfirmedAt: handoverTs,
          status: "PENDING_COLLECTOR",
        },
      });

      // Awaited, not fire-and-forget — this is what makes every flag below a
      // real verdict from the deployed model, not a fabricated row.
      // eslint-disable-next-line no-await-in-loop
      const result = await scoreHandover({
        handoverId: handover.id,
        lotId: lot.id,
        recyclerId: recycler.id,
        collectorId: collector.id,
        categoryId: category.id,
        categoryCode: category.code,
        buyerOffer: publishedPrice,
        buyerOfferUnit: category.defaultUnit,
        finalPrice: finalUnitPrice,
        condition: inspectedCondition,
      });

      if (result.scored) scored += 1;
      if (result.anomaly) anomalies += 1;
      process.stdout.write(result.scored ? (result.anomaly ? "F" : ".") : "x");
    }
    console.log("");

    const rateResult = await refreshEntityFlagRate("RECYCLER", recycler.id);
    summary.push({ recycler: recycler.name, profile: recycler.profile.label, scored, anomalies, rateResult });
  }

  console.log("\n=== Demo transaction seed summary ===");
  for (const s of summary) {
    console.log(`${s.recycler} (${s.profile}): ${s.scored} scored, ${s.anomalies} flagged`
      + ` → entity status: ${JSON.stringify(s.rateResult)}`);
  }
  console.log("\nLegend while running: '.' = scored/clean, 'F' = scored/flagged, 'x' = model unreachable (fail-open, unscored).");
  console.log("\nDone. Log in to the console as an admin (admin@bhaav.demo) and check /admin/queue.");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FATAL:", err);
  await prisma.$disconnect();
  process.exit(1);
});
