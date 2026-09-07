import { PrismaClient } from "@prisma/client";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";

export const prisma = new PrismaClient();

// Order matters: children before parents. Explicit truncation rather than
// reliance on test order — a test must be able to run alone and still pass.
const TABLES = [
  "anomaly_flag",
  "photo",
  "handover",
  "acceptance",
  "lot",
  "recycler_session",
  "recycler_account",
  "rate",
  "collector",
  "category",
  "recycler",
];

// This TRUNCATEs every table and runs in beforeEach, so a full run empties the
// target database ~146 times. That is correct against a throwaway local
// database and catastrophic against a shared one, and nothing in the SQL can
// tell the difference. The target is checked once, loudly, instead.
function assertTruncatable() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (isLocal || process.env.BHAAV_ALLOW_REMOTE_TEST_DB === "1") return;
  const host = url.replace(/^.*@/, "").replace(/[/?].*$/, "") || "(unset)";
  throw new Error(
    `Refusing to TRUNCATE a non-local database: ${host}\n` +
    `The test suite empties every table before every test. If this really is a\n` +
    `disposable database, set BHAAV_ALLOW_REMOTE_TEST_DB=1. Snapshot first with\n` +
    `\`npm run db:backup\` — \`npm run db:restore\` puts it back.`,
  );
}

export async function truncateAll() {
  assertTruncatable();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function makeCategory(over = {}) {
  return prisma.category.create({
    data: {
      code: "PCB",
      nameEn: "Circuit board",
      nameMr: "सर्किट बोर्ड",
      nameHi: "सर्किट बोर्ड",
      iconKey: "pcb",
      defaultUnit: "KG",
      criticalMinerals: ["gold", "tantalum"],
      ...over,
    },
  });
}

export async function makeRecycler(over = {}) {
  return prisma.recycler.create({
    data: {
      name: "Test Recycler",
      address: "Waliv, Vasai East",
      lat: 19.4,
      lng: 72.84,
      type: "RECYCLER",
      registrationNo: `REG-${uuidv7().replace(/-/g, "").slice(0, 16)}`,
      authorizationStatus: "VALID",
      serviceAreaKm: 25,
      materialsAccepted: ["PCB"],
      ...over,
    },
  });
}

export async function makeCollector(over = {}) {
  return prisma.collector.create({
    data: { id: uuidv7(), preferredLanguage: "mr", operatingArea: "Nalasopara", ...over },
  });
}

export async function makeLot({ collectorId, categoryId, ...over } = {}) {
  const id = over.id ?? uuidv7();
  return prisma.lot.create({
    data: {
      id,
      collectorId,
      categoryId,
      unit: "KG",
      quantity: "3.000",
      condition: "GOOD",
      estimatedValue: "1260.00",
      collectionLat: 19.3919,
      collectionLng: 72.8397,
      collectionTs: new Date("2026-09-02T10:14:00+05:30"),
      status: "DRAFT",
      deviceId: "test-device",
      ...over,
    },
  });
}

export async function makeHandover({ lotId, recyclerId, ...over } = {}) {
  const id = over.id ?? uuidv7();
  return prisma.handover.create({
    data: {
      id,
      lotId,
      recyclerId,
      referenceCode: over.referenceCode ?? referenceCodeFromUuid(lotId),
      inspectedQuantity: "2.900",
      finalUnitPrice: "390.00",
      finalTotal: "1131.00",
      handoverTs: new Date("2026-09-02T12:40:00+05:30"),
      status: "PENDING_COLLECTOR",
      ...over,
    },
  });
}
