import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { PARENTS, CHILDREN, DEMO_COORDS, DEMO_RATES } from "./categories.js";

const CSV_PATH = fileURLToPath(new URL("../../../mpcb_recyclers.csv", import.meta.url));

// The demo password is deliberately in the seed, not in .env: it is a
// hackathon fixture, it is written on the demo card, and there is no
// production deployment for it to leak into.
const DEMO_PASSWORD = "bhaav-demo-2026";

function coordsFor(name) {
  const key = Object.keys(DEMO_COORDS).find((k) => name.includes(k));
  return key ? DEMO_COORDS[key] : null;
}

function ratesFor(name) {
  const key = Object.keys(DEMO_RATES).find((k) => name.includes(k));
  return key ? DEMO_RATES[key] : null;
}

async function seedCategories(prisma) {
  const byCode = new Map();
  for (const p of PARENTS) {
    const row = await prisma.category.upsert({
      where: { code: p.code },
      update: {},
      create: { ...p, parentId: null },
    });
    byCode.set(p.code, row);
  }
  for (const c of CHILDREN) {
    // eslint-disable-next-line no-unused-vars
    const { parent, lowerValue, ...data } = c;
    const row = await prisma.category.upsert({
      where: { code: c.code },
      update: {},
      create: { ...data, parentId: byCode.get(parent).id },
    });
    byCode.set(c.code, row);
  }
  return byCode;
}

async function seedConditionFactors(prisma) {
  for (const [condition, factor] of [
    ["GOOD", "1.000"],
    ["FAIR", "0.850"],
    ["POOR", "0.700"],
  ]) {
    await prisma.conditionFactor.upsert({
      where: { condition },
      update: {},
      create: { condition, factor },
    });
  }
}

async function seedRecyclers(prisma, categoryCodes) {
  const rows = parse(readFileSync(CSV_PATH, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const out = [];
  for (const row of rows) {
    const name = row.name_address.split(",")[0].trim();
    const demo = coordsFor(name);

    // The registration column in the CSV is NOT unique — many rows share the
    // same value (e.g. "MPCB/RO(HQ)/HSMD/Autho"). Key the upsert on a
    // synthesised value of sr+registration so the UNIQUE constraint on
    // registration_no surfaces genuine data-quality problems while still
    // letting the seed be idempotent.
    const registrationNo = `${row.sr}-${row.registration}`;

    const created = await prisma.recycler.upsert({
      where: { registrationNo },
      update: {},
      create: {
        name,
        address: row.name_address,
        lat: demo?.lat ?? null,
        lng: demo?.lng ?? null,
        type: row.type?.toUpperCase() === "DISMANTLER" ? "DISMANTLER" : "RECYCLER",
        capacityMta: row.capacity_MTA ? Number(row.capacity_MTA) : null,
        registrationNo,
        validityTo: row.validity ? new Date(row.validity) : null,
        authorizationStatus: row.status === "VALID" ? "VALID" : "LAPSED_IN_LIST",
        district: row.district || null,
        email: row.email || null,
        phone: row.phone || null,
        serviceAreaKm: demo?.serviceAreaKm ?? 25,
        pickupAvailable: demo?.pickupAvailable ?? false,
        // Demo recyclers accept everything on the grid; the rest accept
        // nothing until a real facility tells us otherwise. An empty array
        // means the eligibility gate simply never selects them, which is the
        // honest default.
        materialsAccepted: demo ? categoryCodes : [],
      },
    });
    out.push(created);
  }
  return out;
}

async function seedRatesAndAccounts(prisma, recyclers, byCode) {
  const accounts = [];
  const rates = [];
  for (const rec of recyclers) {
    const table = ratesFor(rec.name);
    if (!table || rec.authorizationStatus !== "VALID") continue;

    for (const [code, price] of Object.entries(table)) {
      const category = byCode.get(code);
      if (!category) continue;

      // rate is append-only, so idempotency is "do not insert a second
      // identical row", never "update the one that is there".
      const existingField = await prisma.rate.findFirst({
        where: { recyclerId: rec.id, categoryId: category.id, source: "FIELD_COLLECTED" },
      });
      if (!existingField) {
        rates.push(
          await prisma.rate.create({
            data: {
              recyclerId: rec.id,
              categoryId: category.id,
              unit: category.defaultUnit,
              price: price.toFixed(2),
              source: "FIELD_COLLECTED",
              location: rec.district ?? null,
            },
          }),
        );
      }

      const existingPublished = await prisma.rate.findFirst({
        where: { recyclerId: rec.id, categoryId: category.id, source: "RECYCLER_PUBLISHED" },
      });
      if (!existingPublished) {
        rates.push(
          await prisma.rate.create({
            data: {
              recyclerId: rec.id,
              categoryId: category.id,
              unit: category.defaultUnit,
              price: price.toFixed(2),
              source: "RECYCLER_PUBLISHED",
            },
          }),
        );
      }
    }

    const email = `${rec.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "")}@bhaav.demo`;
    accounts.push(
      await prisma.recyclerAccount.upsert({
        where: { email },
        update: {},
        create: { recyclerId: rec.id, email, passwordHash: await hashPassword(DEMO_PASSWORD) },
      }),
    );
  }
  return { accounts, rates };
}

export async function seedAll(prisma) {
  const byCode = await seedCategories(prisma);
  await seedConditionFactors(prisma);
  const categoryCodes = [...byCode.keys()];
  const recyclers = await seedRecyclers(prisma, categoryCodes);
  const { accounts, rates } = await seedRatesAndAccounts(prisma, recyclers, byCode);
  return { categories: byCode.size, recyclers: recyclers.length, accounts: accounts.length, rates: rates.length };
}

// Run directly: `npm run seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prisma = new PrismaClient();
  const result = await seedAll(prisma);
  console.log("seeded", result);
  console.log(`console logins: ${DEMO_PASSWORD}`);
  await prisma.$disconnect();
}
