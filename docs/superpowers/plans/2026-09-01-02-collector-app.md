# Collector App Implementation Plan — Bhaav (SIH26229)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android app that lets an informal collector photograph a lot, classify it in one tap, hear every number spoken in Marathi or Hindi, see what the lot is worth at every nearby authorised recycler, accept one, and complete a counter-signed handover — with every screen working at zero bars.

**Architecture:** Expo dev build, Android only, JavaScript. Every write commits to local SQLite and the UI advances immediately; the server is a synchronisation target, never a dependency. Records get a device-generated UUIDv7 at creation, so identity never requires a round trip. An append-only `outbox` table is drained by a single batched `POST /sync/push` whenever connectivity allows. Pricing, ranking, distance and reference codes come from `@bhaav/core`, the same module the server uses, so the phone and the server cannot disagree about a number.

**Tech Stack:** Expo SDK 52 (dev build) · React Native · JavaScript (ESM) · **Prisma on the device** via `@prisma/react-native` + `react-native-quick-sqlite` · `expo-camera` · `expo-location` · `expo-audio` · `expo-file-system` · `react-native-svg` · `react-native-qrcode-svg` · jest-expo · `@testing-library/react-native`

## Global Constraints

Every task's requirements implicitly include [the Global Constraints table in the index](2026-09-01-00-index.md#global-constraints). The ones that shape this app:

- **JavaScript, not TypeScript.** No `.ts`/`.tsx` files.
- **Expo dev build, Android only, minSdk 31 (Android 12).** Not Expo Go — `@prisma/react-native`, `react-native-quick-sqlite` and the dev-client camera are native modules that need a dev build.
- **`client/app` is NOT an npm workspace.** Metro and workspace hoisting fight. It has its own `node_modules` and consumes `@bhaav/core` as a `file:` dependency.
- **Device DB is SQLite accessed through Prisma** — a second Prisma schema at `client/app/prisma/schema.prisma`, generated to a bundled client, backed by `react-native-quick-sqlite`. Migrations ship as SQL and are applied at app start. This is the user's directive and it **overrides `SERVER.md` §1's raw-`expo-sqlite` decision**; see the caveat block below. No WatermelonDB.
- **Marathi + Hindi.** All strings and all audio ship inside the APK. No runtime translation service.
- **Pre-recorded audio, not device TTS.** `expo-speech` uses the OS engine and `mr-IN` voice availability varies by handset. Numbers compose from digit clips.
- **No free text anywhere in the collector flow.** Every input is a tap, a number, or a voice prompt.
- **The UI never waits for the network.** A screen that can show a spinner tied to connectivity is built wrong.
- **Minimum touch target 56dp; primary actions 72dp.** Full flow completable one-handed on a 5-inch screen.
- **Colour never carries meaning alone.** Every status has an icon and a word.
- **Priority: functionality, then collector-facing UX, then cosmetics.** Stated verbatim by the user.

---

## File Structure

```
client/app/package.json               NOT a workspace; @bhaav/core via file:
client/app/app.json                   Expo config — Android only, minSdk 31
client/app/index.js                   entry
client/app/jest.config.js
client/app/babel.config.js

client/app/prisma/schema.prisma       the DEVICE schema (SQLite provider), separate from server/api's
client/app/prisma/migrations/         bundled SQL migrations, applied at app start
client/app/src/db/client.js           the generated Prisma client singleton + runtime migration bootstrap
client/app/src/db/repos/lots.js       createLot, listLots, setStatus
client/app/src/db/repos/acceptances.js
client/app/src/db/repos/handovers.js
client/app/src/db/repos/photos.js
client/app/src/db/repos/outbox.js     enqueue, pending, markSynced, bump
client/app/src/db/repos/reference.js  categories, recyclers, rates, conditionFactors

client/app/src/audio/clips.js         the clip manifest
client/app/src/audio/speak.js         speakNumber, speakKey, speakRupees
client/app/src/i18n/strings.js        mr + hi string table
client/app/src/i18n/useLang.js        language context

client/app/src/theme/tokens.js        colour, spacing, type scale, touch targets
client/app/src/components/BigButton.js
client/app/src/components/StatusChip.js
client/app/src/components/PendingPill.js
client/app/src/components/StalenessStrip.js
client/app/src/components/NumericKeypad.js
client/app/src/components/CategoryIcon.js
client/app/src/components/ConditionIcon.js
client/app/src/components/PhotoStrip.js
client/app/src/components/RankRow.js
client/app/src/components/ConfirmSheet.js
client/app/src/components/QRPanel.js

client/app/src/screens/S0Home.js
client/app/src/screens/S1Camera.js
client/app/src/screens/S2Category.js
client/app/src/screens/S3SubCategory.js
client/app/src/screens/S4Quantity.js
client/app/src/screens/S4bCondition.js
client/app/src/screens/S4cSource.js
client/app/src/screens/S5Value.js
client/app/src/screens/S6Accept.js
client/app/src/screens/S7Handover.js
client/app/src/screens/S8Ledger.js
client/app/src/screens/PriceBoard.js
client/app/src/screens/Safety.js

client/app/src/state/LotDraft.js      the in-flight lot, S1 through S6
client/app/src/state/Session.js       collector id, device id, language
client/app/src/sync/engine.js         bootstrap, delta, push
client/app/src/sync/net.js            reachability probe, never a UI gate

client/app/assets/audio/mr/*.m4a      ~60 clips
client/app/assets/audio/hi/*.m4a
client/app/test/**/*.test.js
```

**Why the file split runs this way.** Screens hold no data logic: every read and write goes through a repo, so a screen test never needs the database and a repo test never needs a renderer. Because the screens call repo *functions* and never touch the database directly, swapping the repo internals from raw SQL to Prisma changes nothing above the repo layer — which is why this directive is cheap to honour. `@bhaav/core` holds everything that must match the server exactly. The audio layer is one module because the number-composition rule (digits + "rupees" + "kilo") is the part most likely to be got wrong twice if it is written twice.

<a id="device-db-prisma-caveat"></a>
### Caveat — Prisma on the device is Early Access

The user asked for Prisma on the device DB as well as the server, and this plan does that. Two things the implementer must know, because `SERVER.md` §1 originally chose raw `expo-sqlite` specifically to avoid them:

1. **Prisma's React Native support is Early Access and uses `react-native-quick-sqlite`, not `expo-sqlite`.** It is a native module, so it only runs in a **dev build** (never Expo Go) and the generated client targets the `react-native` engine.
2. **On-device migrations are bundled SQL, applied at app start.** There is no `prisma migrate dev` running on the phone. The workflow: evolve `client/app/prisma/schema.prisma`, run `prisma migrate dev` on your laptop against a throwaway SQLite file to *generate* the SQL, commit that SQL under `client/app/prisma/migrations/`, and apply it at runtime with `@prisma/react-native`'s migration helper.

**Fallback that keeps the plan alive.** If the native build fails on the demo hardware (the most likely failure, and it is Early Access), the repo layer's function signatures are identical to a raw-`expo-sqlite` implementation. Reverting `src/db/client.js` and the repo bodies to raw `expo-sqlite` restores a working app without touching a single screen or test above the repo boundary. Keep that escape hatch in mind; do not let a native-build problem block the demo spine.

---

## Prerequisite: what must exist before task 1

- Plan 01 tasks 1–4 complete (`@bhaav/core` with `constants`, `pricing`, `geo`, `ids`, `ranking`, `validate`).
- Android Studio with an Android 12 (API 31) system image, **or** a physical Android 12+ device with USB debugging on.
- Node 22 active (`nvm use 22`).

Tasks 1–20 run entirely against the local device database with no server. Task 21 needs plan 01 tasks 9–11.

---

## Task 1: Expo scaffold, jest-expo, and `@bhaav/core` wired in

**Files:**
- Create: `client/app/package.json`, `client/app/app.json`, `client/app/babel.config.js`, `client/app/jest.config.js`, `client/app/index.js`, `client/app/App.js`
- Test: `client/app/test/core-wiring.test.js`

**Interfaces:**
- Consumes: `@bhaav/core/*` from plan 01
- Produces: a launchable Expo dev build and a green Jest run

- [ ] **Step 1: Create the app**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)"
npx create-expo-app@latest client/app --template blank
```

Expected: `client/app` with `App.js`, `app.json`, `package.json`. Delete any `.tsx` the template leaves behind — this project is JavaScript.

- [ ] **Step 2: Install the runtime and test dependencies**

```bash
cd client/app
npx expo install expo-camera expo-location expo-file-system expo-audio expo-image-manipulator react-native-svg react-native-safe-area-context react-native-screens @react-navigation/native @react-navigation/native-stack expo-dev-client
npx expo install @prisma/react-native react-native-quick-sqlite
npm install react-native-qrcode-svg
npm install --save-dev prisma @prisma/client jest jest-expo @testing-library/react-native @testing-library/jest-native
npm install "@bhaav/core@file:../../packages/core"
```

`expo install` picks versions matched to the installed SDK — never `npm install` an `expo-*` package directly, or the native module will not match the dev build.

- [ ] **Step 3: Configure `client/app/app.json`**

```json
{
  "expo": {
    "name": "Bhaav",
    "slug": "bhaav",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "platforms": ["android"],
    "assetBundlePatterns": ["assets/**/*"],
    "android": {
      "package": "in.bhaav.collector",
      "minSdkVersion": 31,
      "compileSdkVersion": 34,
      "targetSdkVersion": 34,
      "permissions": ["CAMERA", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
      "usesCleartextTraffic": true
    },
    "plugins": [
      "expo-dev-client",
      "@prisma/react-native",
      ["expo-camera", { "cameraPermission": "Bhaav needs the camera to photograph the material." }],
      [
        "expo-location",
        { "locationAlwaysAndWhenInUsePermission": "Bhaav records where a lot was collected." }
      ]
    ]
  }
}
```

`usesCleartextTraffic` is required: over a phone hotspot the API is plain `http://192.168.x.x:4000` and Android 9+ blocks cleartext by default. This is a demo-network decision, and the README's ground rules already say the record is not tamper-proof — it does not need to also claim TLS it does not have.

- [ ] **Step 4: Configure Jest**

`client/app/jest.config.js`:

```js
export default {
  preset: "jest-expo",
  setupFilesAfterEach: [],
  setupFilesAfterEnv: ["@testing-library/jest-native/extend-expect"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-qrcode-svg|@bhaav/core))",
  ],
  moduleNameMapper: {
    "\\.(m4a|mp3|png|jpg)$": "<rootDir>/test/__mocks__/fileMock.js",
  },
};
```

`@bhaav/core` must be in `transformIgnorePatterns`' negative lookahead: it ships untranspiled ESM, and Metro's default is to skip `node_modules`.

`client/app/test/__mocks__/fileMock.js`:

```js
module.exports = 1;
```

Add to `client/app/package.json` scripts:

```json
  "scripts": {
    "start": "expo start --dev-client",
    "android": "expo run:android",
    "test": "jest"
  }
```

- [ ] **Step 5: Write the failing wiring test**

`client/app/test/core-wiring.test.js`:

```js
import { estimateValue } from "@bhaav/core/pricing";
import { referenceCodeFromUuid, uuidv7 } from "@bhaav/core/ids";
import { rankRecyclers } from "@bhaav/core/ranking";
import { CATEGORY_CODES } from "@bhaav/core/constants";

describe("@bhaav/core is importable from the app", () => {
  it("computes the same estimate the server does", () => {
    expect(estimateValue({ quantity: 3, unitPrice: 420, condition: "GOOD" })).toBe(1260);
  });

  it("derives a reference code on the device", () => {
    const id = uuidv7();
    expect(referenceCodeFromUuid(id)).toHaveLength(8);
  });

  it("ranks recyclers offline", () => {
    const out = rankRecyclers({
      lot: { categoryCode: "PCB", quantity: 3, condition: "GOOD" },
      from: { lat: 19.3919, lng: 72.8397 },
      asOf: "2026-09-02T12:00:00+05:30",
      recyclers: [
        {
          id: "r1",
          name: "R",
          lat: 19.4,
          lng: 72.84,
          authorizationStatus: "VALID",
          materialsAccepted: ["PCB"],
          serviceAreaKm: 25,
          pickupAvailable: false,
        },
      ],
      rates: [
        {
          recyclerId: "r1",
          categoryCode: "PCB",
          unit: "KG",
          price: 430,
          validFrom: "2026-09-02T09:00:00+05:30",
        },
      ],
    });
    expect(out[0].value).toBe(1290);
    expect(out[0].recommended).toBe(true);
  });

  it("exposes the eight category codes", () => {
    expect(CATEGORY_CODES).toHaveLength(8);
  });
});
```

- [ ] **Step 6: Run it**

```bash
cd client/app && npm test
```

Expected: PASS, 4 tests. If `@bhaav/core` fails to resolve, confirm `transformIgnorePatterns` includes it and that `npm install "@bhaav/core@file:../../packages/core"` created a symlink under `client/app/node_modules/@bhaav/core`.

- [ ] **Step 7: Build and install the dev build on the device**

```bash
cd client/app && npx expo run:android
```

Expected: a Gradle build, then the app launching on the connected Android 12+ device or emulator. **This step will take 10–20 minutes the first time.** If it fails on the Android SDK path, set `ANDROID_HOME` and re-run; if it fails on a licence, run `sdkmanager --licenses`.

- [ ] **Step 8: Commit**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)"
git add client/app
git commit -m "feat(app): expo dev build scaffold, android 12 target, @bhaav/core wired in"
```

---

## Task 2: The device database — Prisma schema, migration, client

**Files:**
- Create: `client/app/prisma/schema.prisma` (the device schema), `client/app/src/db/client.js`, `client/app/prisma/.env`
- Generated + committed: `client/app/prisma/migrations/<ts>_init/migration.sql`
- Test: `client/app/test/db/migration.test.js`, `client/app/test/helpers/prismaTestClient.js`

**Interfaces:**
- Produces: `getPrisma() -> Promise<PrismaClient>` (the singleton, migrations applied), `MIGRATION_SQL` (the bundled statements), `applyMigrations(prisma)`

The device schema is a **second Prisma schema**, separate from `server/api`'s and living under `client/app/prisma/`. It mirrors the server's tables plus `outbox`, which exists only on the phone. On SQLite there is no decimal type, so money and quantity are `Float`; every value is rounded through `round2` from `@bhaav/core` before it is written, and the server re-derives every total anyway. Timestamps are `String` (ISO-8601) rather than Prisma `DateTime`, because a lot may be created days before it syncs and the ISO string is exactly what the outbox payload and the server expect.

**Same Prisma Client API, two engines.** On the device the client is generated for the `react-native` engine (`@prisma/react-native` + `react-native-quick-sqlite`). In Jest, the repos are exercised against a **node** `PrismaClient` pointed at a temporary SQLite file, using the same generated model methods. The repos never know which engine they are talking to — they take the client as their first argument — so one test suite covers both. This is why the switch to Prisma costs the screens nothing.

- [ ] **Step 1: Write the device Prisma schema**

`client/app/prisma/schema.prisma`:

```prisma
// The device client targets the react-native engine (runs on the phone over
// react-native-quick-sqlite).
generator client {
  provider   = "prisma-client-js"
  engineType = "react-native"
  output     = "../src/db/generated"
}

// A second, node-engine client generated from the SAME models, used only by
// Jest. A react-native-engine client cannot run under Node, so the repo tests
// import this one and point it at a temp SQLite file. The model API is
// identical, so one repo body serves both.
generator testClient {
  provider = "prisma-client-js"
  output   = "../src/db/generated-node"
}

datasource db {
  provider = "sqlite"
  url      = "file:./bhaav.db"
}

// A cached copy of what /sync/bootstrap returned. Replaceable — if lost, the
// app re-fetches it. Everything from Collector down is AUTHORED on the device
// and exists nowhere else until the outbox drains, which is why it carries
// device-generated uuids.
model Meta {
  key   String @id
  value String?

  @@map("meta")
}

model Category {
  id               String  @id
  code             String  @unique
  parentCode       String? @map("parent_code")
  nameEn           String  @map("name_en")
  nameMr           String  @map("name_mr")
  nameHi           String  @map("name_hi")
  iconKey          String  @map("icon_key")
  defaultUnit      String  @map("default_unit")
  criticalMinerals String  @default("[]") @map("critical_minerals")

  @@map("category")
}

model Recycler {
  id                  String  @id
  name                String
  address             String?
  lat                 Float?
  lng                 Float?
  district            String?
  phone               String?
  authorizationStatus String  @map("authorization_status")
  validityTo          String? @map("validity_to")
  serviceAreaKm       Int     @default(25) @map("service_area_km")
  pickupAvailable     Boolean @default(false) @map("pickup_available")
  materialsAccepted   String  @default("[]") @map("materials_accepted")

  @@map("recycler")
}

model Rate {
  recyclerId   String @map("recycler_id")
  categoryCode String @map("category_code")
  unit         String
  price        Float
  validFrom    String @map("valid_from")

  @@id([recyclerId, categoryCode])
  @@map("rate")
}

model ConditionFactor {
  condition String @id
  factor    Float

  @@map("condition_factor")
}

model Collector {
  id                String  @id
  preferredLanguage String  @map("preferred_language")
  operatingArea     String? @map("operating_area")
  createdAt         String  @map("created_at")

  lots Lot[]

  @@map("collector")
}

// Money and quantity are Float: SQLite has no decimal type. Every value is
// rounded through round2 from @bhaav/core before it is written, and the server
// re-derives every total anyway. Timestamps are ISO-8601 strings because a lot
// may be created days before it syncs (DB.md 3.5).
model Lot {
  id             String  @id
  collectorId    String  @map("collector_id")
  categoryId     String  @map("category_id")
  categoryCode   String  @map("category_code")
  unit           String
  quantity       Float
  condition      String
  sourceType     String? @map("source_type")
  estimatedValue Float   @map("estimated_value")
  collectionLat  Float?  @map("collection_lat")
  collectionLng  Float?  @map("collection_lng")
  collectionTs   String  @map("collection_ts")
  status         String
  deviceId       String  @map("device_id")
  createdAt      String  @map("created_at")

  collector   Collector    @relation(fields: [collectorId], references: [id])
  acceptances Acceptance[]
  handover    Handover?
  photos      Photo[]

  @@index([createdAt], map: "lot_by_created")
  @@map("lot")
}

model Acceptance {
  id               String  @id
  lotId            String  @map("lot_id")
  recyclerId       String  @map("recycler_id")
  acceptedRate     Float   @map("accepted_rate")
  acceptedUnit     String  @map("accepted_unit")
  acceptedTs       String  @map("accepted_ts")
  recyclerResponse String  @default("NONE") @map("recycler_response")
  responseTs       String? @map("response_ts")
  createdAt        String  @map("created_at")

  lot Lot @relation(fields: [lotId], references: [id])

  @@index([lotId], map: "acceptance_by_lot")
  @@map("acceptance")
}

model Handover {
  id                   String  @id
  lotId                String  @unique @map("lot_id")
  recyclerId           String  @map("recycler_id")
  referenceCode        String  @map("reference_code")
  inspectedQuantity    Float   @map("inspected_quantity")
  finalUnitPrice       Float   @map("final_unit_price")
  finalTotal           Float   @map("final_total")
  inspectedCondition   String? @map("inspected_condition")
  downgradeReasonCode  String? @map("downgrade_reason_code")
  collectorProtest     Boolean @default(false) @map("collector_protest")
  handoverLat          Float?  @map("handover_lat")
  handoverLng          Float?  @map("handover_lng")
  handoverTs           String  @map("handover_ts")
  status               String
  recyclerConfirmedAt  String? @map("recycler_confirmed_at")
  collectorConfirmedAt String? @map("collector_confirmed_at")
  createdAt            String  @map("created_at")

  lot Lot @relation(fields: [lotId], references: [id])

  @@map("handover")
}

model Photo {
  id         String  @id
  lotId      String  @map("lot_id")
  kind       String
  localUri   String  @map("local_uri")
  sha256     String
  bytes      Int
  uploadedAt String? @map("uploaded_at")
  createdAt  String  @map("created_at")

  lot Lot @relation(fields: [lotId], references: [id])

  @@index([lotId], map: "photo_by_lot")
  @@map("photo")
}

// Device only — never on the server. Append-only and idempotent by
// construction: the server upserts by uuid, so replaying a batch is harmless.
model Outbox {
  id         String  @id
  entityType String  @map("entity_type")
  entityId   String  @map("entity_id")
  payload    String
  createdAt  String  @map("created_at")
  attempts   Int     @default(0)
  lastError  String? @map("last_error")
  syncedAt   String? @map("synced_at")

  @@index([syncedAt, createdAt], map: "outbox_pending")
  @@map("outbox")
}
```

- [ ] **Step 2: Generate the client and the baseline migration**

```bash
cd client/app
printf 'DATABASE_URL="file:./bhaav.db"\n' > prisma/.env
npx prisma migrate dev --name init --schema prisma/schema.prisma
```

Expected: `client/app/src/db/generated/` (the generated client) and `client/app/prisma/migrations/<ts>_init/migration.sql`. The `migrate dev` runs against a throwaway laptop SQLite file purely to *emit the SQL* — the phone never runs `migrate dev`, it applies the committed SQL at start-up (task 2 caveat).

Add the generated output to lint/format ignore, and to `.gitignore` **only** the generated client, never the migration SQL:

```bash
echo "client/app/src/db/generated/" >> ../.gitignore
echo "client/app/src/db/generated-node/" >> ../.gitignore
echo "client/app/prisma/.env" >> ../.gitignore
```

- [ ] **Step 3: Write the failing migration test**

`client/app/test/helpers/prismaTestClient.js`:

```js
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { PrismaClient } from "../../src/db/generated-node/index.js";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/**
 * A node-engine Prisma client against a fresh temp SQLite file, with every
 * committed migration applied. The repos are engine-agnostic — they call
 * prisma.lot.create(), prisma.$transaction(), etc. — so this exercises the
 * exact code path the react-native client runs on the phone.
 */
export async function makePrismaClient() {
  const dir = mkdtempSync(join(tmpdir(), "bhaav-"));
  const url = `file:${join(dir, "test.db")}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  for (const name of readdirSync(MIGRATIONS_DIR).sort()) {
    const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
    let sql;
    try {
      sql = readFileSync(sqlPath, "utf8");
    } catch {
      continue; // migration_lock.toml and the like
    }
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(stmt);
    }
  }
  return prisma;
}
```

`client/app/test/db/migration.test.js`:

```js
import { makePrismaClient } from "../helpers/prismaTestClient.js";

let prisma;
beforeEach(async () => {
  prisma = await makePrismaClient();
});
afterEach(async () => {
  await prisma.$disconnect();
});

describe("device migration", () => {
  it("creates every model table", async () => {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = rows.map((r) => r.name);
    for (const t of [
      "acceptance", "category", "collector", "condition_factor",
      "handover", "lot", "meta", "outbox", "photo", "rate", "recycler",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("lets a collector and a lot round-trip through the model API", async () => {
    await prisma.collector.create({
      data: { id: "c1", preferredLanguage: "mr", createdAt: new Date().toISOString() },
    });
    const lot = await prisma.lot.create({
      data: {
        id: "l1",
        collectorId: "c1",
        categoryId: "cat1",
        categoryCode: "PCB",
        unit: "KG",
        quantity: 3,
        condition: "GOOD",
        estimatedValue: 1260,
        collectionTs: "2026-09-02T10:14:00+05:30",
        status: "DRAFT",
        deviceId: "pixel",
        createdAt: new Date().toISOString(),
      },
    });
    expect(lot.id).toBe("l1");
  });

  it("indexes the outbox on synced_at so draining is a single scan", async () => {
    const idx = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='outbox_pending'",
    );
    expect(idx).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run it and watch it fail, then pass**

```bash
cd client/app && npx jest test/db/migration.test.js
```

Expected: FAIL if `src/db/generated` or the migration SQL is missing — re-run step 2. Once both exist: PASS, 3 tests.

- [ ] **Step 5: Write `client/app/src/db/client.js`**

```js
import { PrismaClient } from "./generated/index.js";
import { migrations } from "./migrations.js";

let client = null;

/**
 * The device Prisma client singleton. On React Native the generated client
 * targets the `react-native` engine over react-native-quick-sqlite; the app
 * never opens a raw handle.
 *
 * On-device migrations are the bundled SQL applied once at first open. There
 * is no `prisma migrate dev` on the phone — `migrations.js` re-exports the
 * committed SQL, and `applyMigrations` runs any not yet recorded in
 * `_migrations`.
 */
export async function getPrisma() {
  if (client) return client;
  client = new PrismaClient();
  await applyMigrations(client);
  return client;
}

export async function applyMigrations(prisma) {
  await prisma.$executeRawUnsafe(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const done = new Set(
    (await prisma.$queryRawUnsafe("SELECT name FROM _migrations")).map((r) => r.name),
  );
  for (const { name, sql } of migrations) {
    if (done.has(name)) continue;
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$executeRawUnsafe(stmt);
    }
    await prisma.$executeRawUnsafe("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", name, new Date().toISOString());
  }
}

// Test-only. Never called from app code.
export function __resetClientForTests() {
  client = null;
}
```

`client/app/src/db/migrations.js`:

```js
// The committed migration SQL, imported as a string so it ships inside the
// bundle. Metro bundles .sql via the metro.config.js assetExts entry added in
// task 1's follow-up. Each entry's `name` matches the migration directory, so
// applyMigrations records it in _migrations and never re-runs it.
//
// When the schema evolves: run `prisma migrate dev` on your laptop, commit the
// new prisma/migrations/<ts>_<name>/migration.sql, and append an entry here.
import initSql from "../../prisma/migrations/_bundled/init.sql";

export const migrations = [{ name: "init", sql: initSql }];
```

> **Bundling the SQL.** Metro does not bundle arbitrary text by default. Two options: (a) add `sql` to `assetExts` in `metro.config.js` and read the asset, or (b) the simpler route — copy the generated `migration.sql` into `prisma/migrations/_bundled/init.sql` and inline it as a JS template string in a `.js` file. Prefer (b) for reliability: create `client/app/src/db/migrations.js` exporting the SQL as a backtick string, so there is no Metro asset resolution to fail at runtime. Use the generated `migration.sql` verbatim as its contents.

- [ ] **Step 6: Commit**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)"
git add client/app/prisma client/app/src/db/client.js client/app/src/db/migrations.js client/app/test/db client/app/test/helpers/prismaTestClient.js .gitignore
git commit -m "feat(app): device Prisma schema, generated client, bundled runtime migrations"
```

---

## Task 3: Repositories — lots, acceptances, handovers, photos, outbox

Every write in the app goes through one of these, and **every write that must reach the server enqueues an outbox row in the same transaction**. That coupling is the whole offline contract; if a screen ever writes a lot without an outbox row, the record silently never syncs.

**Files:**
- Create: `client/app/src/db/repos/outbox.js`, `lots.js`, `acceptances.js`, `handovers.js`, `photos.js`, `reference.js`
- Test: `client/app/test/db/repos.test.js`

**Interfaces:**
- Produces:
  - `enqueue(db, entityType, entityId, payload)`, `pending(db, limit)`, `markSynced(db, ids)`, `bumpAttempt(db, id, error)`, `pendingCount(db)`
  - `createLot(db, draft) -> lot`, `listLots(db, limit)`, `setLotStatus(db, id, status)`, `earningsTotals(db)`
  - `createAcceptance(db, { lotId, recyclerId, rate, unit })`
  - `createHandover(db, payload)`, `confirmHandover(db, { lotId, agree, protest })`
  - `savePhoto(db, { lotId, kind, uri, sha256, bytes })`
  - `replaceReference(db, snapshot)`, `loadReference(db)`, `rateAgeDays(db)`

- [ ] **Step 1: Write the failing test**

`client/app/test/db/repos.test.js`:

```js
import { uuidv7 } from "@bhaav/core/ids";
import { enqueue, pending, markSynced, bumpAttempt, pendingCount } from "../../src/db/repos/outbox.js";
import { createLot, listLots, setLotStatus, earningsTotals } from "../../src/db/repos/lots.js";
import { createAcceptance } from "../../src/db/repos/acceptances.js";
import { createHandover, confirmHandover } from "../../src/db/repos/handovers.js";
import { makePrismaClient } from "../helpers/prismaTestClient.js";

let db;
const collectorId = uuidv7();

beforeEach(async () => {
  db = await makePrismaClient();
  await db.collector.create({
    data: { id: collectorId, preferredLanguage: "mr", createdAt: new Date().toISOString() },
  });
});
afterEach(async () => {
  await db.$disconnect();
});

const draft = (over = {}) => ({
  collectorId,
  categoryId: "cat-1",
  categoryCode: "PCB",
  unit: "KG",
  quantity: 3,
  condition: "GOOD",
  sourceType: "HOUSEHOLD",
  estimatedValue: 1260,
  collectionLat: 19.3919,
  collectionLng: 72.8397,
  collectionTs: "2026-09-02T10:14:00+05:30",
  deviceId: "pixel-demo",
  ...over,
});

describe("createLot", () => {
  it("writes the lot and one outbox row in the same call", async () => {
    const lot = await createLot(db, draft());
    expect(lot.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await pendingCount(db)).toBe(1);
  });

  it("gives the lot a device-generated uuid before anything touches a network", async () => {
    const a = await createLot(db, draft());
    const b = await createLot(db, draft());
    expect(a.id).not.toBe(b.id);
  });

  it("stores the lot at DRAFT", async () => {
    const lot = await createLot(db, draft());
    expect(lot.status).toBe("DRAFT");
  });

  it("puts the full server payload in the outbox row, not a reference to it", async () => {
    await createLot(db, draft());
    const [row] = await pending(db);
    const payload = JSON.parse(row.payload);
    expect(payload.category_id).toBe("cat-1");
    expect(payload.quantity).toBe(3);
    expect(payload.condition).toBe("GOOD");
    expect(payload.collection_ts).toBe("2026-09-02T10:14:00+05:30");
  });

  it("lists lots newest first", async () => {
    const first = await createLot(db, draft());
    await new Promise((r) => setTimeout(r, 3));
    const second = await createLot(db, draft());
    const rows = await listLots(db, 10);
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });
});

describe("createAcceptance", () => {
  it("writes the acceptance, flips the lot to ACCEPTED and enqueues both", async () => {
    const lot = await createLot(db, draft());
    await createAcceptance(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      rate: 420,
      unit: "KG",
    });
    const rows = await pending(db);
    expect(rows.map((r) => r.entityType)).toEqual(["lot", "acceptance"]);
    const stored = (await listLots(db, 1))[0];
    expect(stored.status).toBe("ACCEPTED");
  });

  it("freezes the accepted rate rather than storing a pointer to the rate table", async () => {
    const lot = await createLot(db, draft());
    await createAcceptance(db, { lotId: lot.id, recyclerId: "rec-1", rate: 420, unit: "KG" });
    await db.$executeRawUnsafe("UPDATE rate SET price = 1");
    const acc = await db.acceptance.findFirst();
    expect(acc.acceptedRate).toBe(420);
  });
});

describe("confirmHandover", () => {
  it("records the collector signature and enqueues the confirmation", async () => {
    const lot = await createLot(db, draft());
    await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 2.9,
      finalUnitPrice: 390,
      finalTotal: 1131,
      handoverTs: "2026-09-02T12:40:00+05:30",
      recyclerConfirmedAt: "2026-09-02T12:40:00+05:30",
    });
    const h = await confirmHandover(db, { lotId: lot.id, agree: true });
    expect(h.status).toBe("CONFIRMED");
    expect(h.collectorConfirmedAt).not.toBeNull();
    const types = (await pending(db)).map((r) => r.entityType);
    expect(types).toContain("handover_confirm");
  });

  it("marks DISPUTED when the collector says the amount is wrong", async () => {
    const lot = await createLot(db, draft());
    await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 2.9,
      finalUnitPrice: 390,
      finalTotal: 1131,
      handoverTs: "2026-09-02T12:40:00+05:30",
      recyclerConfirmedAt: "2026-09-02T12:40:00+05:30",
    });
    const h = await confirmHandover(db, { lotId: lot.id, agree: false });
    expect(h.status).toBe("DISPUTED");
  });

  it("derives the reference code from the lot uuid so the QR matches the server", async () => {
    const { referenceCodeFromUuid } = await import("@bhaav/core/ids");
    const lot = await createLot(db, draft());
    const h = await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 2.9,
      finalUnitPrice: 390,
      finalTotal: 1131,
      handoverTs: "2026-09-02T12:40:00+05:30",
    });
    expect(h.referenceCode).toBe(referenceCodeFromUuid(lot.id));
  });
});

describe("outbox", () => {
  it("returns only unsynced rows, oldest first", async () => {
    const a = await createLot(db, draft());
    const b = await createLot(db, draft());
    const rows = await pending(db);
    expect(rows).toHaveLength(2);
    await markSynced(db, [rows[0].id]);
    const left = await pending(db);
    expect(left).toHaveLength(1);
    expect(left[0].entityId).toBe(b.id);
    expect(a.id).toBeDefined();
  });

  it("counts pending rows for the header pill", async () => {
    await createLot(db, draft());
    await createLot(db, draft());
    expect(await pendingCount(db)).toBe(2);
  });

  it("increments attempts and records the reason on a rejection", async () => {
    await createLot(db, draft());
    const [row] = await pending(db);
    await bumpAttempt(db, row.id, "unknown lot");
    const [again] = await pending(db);
    expect(again.attempts).toBe(1);
    expect(again.lastError).toBe("unknown lot");
  });

  it("keeps a rejected row pending so it is retried", async () => {
    await createLot(db, draft());
    const [row] = await pending(db);
    await bumpAttempt(db, row.id, "network");
    expect(await pendingCount(db)).toBe(1);
  });
});

describe("earningsTotals", () => {
  it("sums confirmed handovers for this week and this month", async () => {
    const lot = await createLot(db, draft());
    await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 3,
      finalUnitPrice: 400,
      finalTotal: 1200,
      handoverTs: new Date().toISOString(),
      recyclerConfirmedAt: new Date().toISOString(),
    });
    await confirmHandover(db, { lotId: lot.id, agree: true });
    const t = await earningsTotals(db);
    expect(t.month).toBe(1200);
    expect(t.week).toBe(1200);
  });

  it("excludes an unconfirmed handover — it is not money yet", async () => {
    const lot = await createLot(db, draft());
    await createHandover(db, {
      lotId: lot.id,
      recyclerId: "rec-1",
      inspectedQuantity: 3,
      finalUnitPrice: 400,
      finalTotal: 1200,
      handoverTs: new Date().toISOString(),
    });
    expect((await earningsTotals(db)).month).toBe(0);
  });
});
```

This reuses `makePrismaClient` from `client/app/test/helpers/prismaTestClient.js`, written in task 2 — a node-engine Prisma client against a fresh temp SQLite file with the committed migrations applied. Each test gets its own file, so there is no shared state and no ordering dependency. The repos call the Prisma model API (`db.lot.create`, `db.$transaction`, …), so the same code runs here and on the phone; the only difference is the engine underneath.

> Every repo takes the Prisma client as its first argument, named `db`. On the device that is the `react-native`-engine client from `getPrisma()`; in tests it is the node client from `makePrismaClient()`. The repos never branch on which — that is the whole reason the switch to Prisma costs the screens nothing.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd client/app && npx jest test/db/repos.test.js
```

Expected: FAIL — the repo modules do not exist.

- [ ] **Step 3: Write `client/app/src/db/repos/outbox.js`**

```js
import { uuidv7 } from "@bhaav/core/ids";

/**
 * The outbox is append-only and idempotent by construction: the server upserts
 * by the record's own uuid, so replaying a batch is harmless (SERVER.md 2.3).
 *
 * A row is enqueued in the SAME call that writes the record. If a screen ever
 * writes a lot without enqueuing, that lot silently never reaches the server —
 * so no screen writes directly; everything goes through a repo.
 */
export async function enqueue(db, entityType, entityId, payload) {
  const id = uuidv7();
  await db.outbox.create({
    data: {
      id,
      entityType,
      entityId,
      payload: JSON.stringify(payload),
      createdAt: new Date().toISOString(),
      attempts: 0,
    },
  });
  return id;
}

export async function pending(db, limit = 500) {
  return db.outbox.findMany({
    where: { syncedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function pendingCount(db) {
  return db.outbox.count({ where: { syncedAt: null } });
}

export async function markSynced(db, ids) {
  if (ids.length === 0) return;
  await db.outbox.updateMany({
    where: { id: { in: ids } },
    data: { syncedAt: new Date().toISOString() },
  });
}

/**
 * A rejected row STAYS pending. The server told us why; the reason is stored
 * so the sync detail sheet can show it, and the row is retried on the next
 * drain. Deleting it would lose the collector's record permanently.
 */
export async function bumpAttempt(db, id, error) {
  await db.outbox.update({
    where: { id },
    data: { attempts: { increment: 1 }, lastError: error ?? null },
  });
}
```

- [ ] **Step 4: Write `client/app/src/db/repos/lots.js`**

```js
import { uuidv7 } from "@bhaav/core/ids";
import { enqueue } from "./outbox.js";

const WEEK_MS = 7 * 86_400_000;

export async function createLot(db, draft) {
  const id = uuidv7();
  const createdAt = new Date().toISOString();

  const payload = {
    id,
    collector_id: draft.collectorId,
    category_id: draft.categoryId,
    unit: draft.unit,
    quantity: draft.quantity,
    condition: draft.condition,
    source_type: draft.sourceType ?? null,
    estimated_value: draft.estimatedValue,
    collection_lat: draft.collectionLat ?? null,
    collection_lng: draft.collectionLng ?? null,
    collection_ts: draft.collectionTs,
    status: "DRAFT",
    device_id: draft.deviceId,
  };

  // One interactive transaction: the lot row and its outbox row commit
  // together or not at all. Passing `tx` into enqueue routes its create
  // through the same transaction. If a lot could land without its outbox row,
  // it would silently never sync.
  await db.$transaction(async (tx) => {
    await tx.lot.create({
      data: {
        id,
        collectorId: draft.collectorId,
        categoryId: draft.categoryId,
        categoryCode: draft.categoryCode,
        unit: draft.unit,
        quantity: draft.quantity,
        condition: draft.condition,
        sourceType: draft.sourceType ?? null,
        estimatedValue: draft.estimatedValue,
        collectionLat: draft.collectionLat ?? null,
        collectionLng: draft.collectionLng ?? null,
        collectionTs: draft.collectionTs,
        status: "DRAFT",
        deviceId: draft.deviceId,
        createdAt,
      },
    });
    await enqueue(tx, "lot", id, payload);
  });

  return { id, status: "DRAFT", created_at: createdAt, ...draft };
}

export async function setLotStatus(db, id, status) {
  await db.lot.update({ where: { id }, data: { status } });
}

export async function listLots(db, limit = 50) {
  const rows = await db.lot.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      handover: { select: { finalTotal: true, status: true, collectorConfirmedAt: true } },
    },
  });
  // Flatten the handover fields the ledger reads. The lot keeps its own
  // `status`; the handover state is surfaced separately as `handoverStatus`.
  return rows.map((l) => ({
    ...l,
    finalTotal: l.handover?.finalTotal ?? null,
    handoverStatus: l.handover?.status ?? null,
    collectorConfirmedAt: l.handover?.collectorConfirmedAt ?? null,
  }));
}

export async function getLot(db, id) {
  return db.lot.findUnique({ where: { id } });
}

/**
 * Only a CONFIRMED handover counts. An unconfirmed one is an amount the
 * collector has not agreed to yet, and showing it as earnings would be the app
 * telling them they have money they do not have.
 *
 * handoverTs is an ISO-8601 string. Device-created handovers use
 * `new Date().toISOString()` (UTC, fixed width), so a lexicographic `gte`
 * against the UTC week/month cursors is a correct chronological comparison.
 */
export async function earningsTotals(db) {
  const now = Date.now();
  const weekStart = new Date(now - WEEK_MS).toISOString();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const sumSince = async (since) => {
    const agg = await db.handover.aggregate({
      _sum: { finalTotal: true },
      where: { status: "CONFIRMED", handoverTs: { gte: since } },
    });
    return Number(agg._sum.finalTotal ?? 0);
  };

  return { week: await sumSince(weekStart), month: await sumSince(monthStart) };
}
```

- [ ] **Step 5: Write `client/app/src/db/repos/acceptances.js`**

```js
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
```

- [ ] **Step 6: Write `client/app/src/db/repos/handovers.js`**

```js
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { enqueue } from "./outbox.js";
import { setLotStatus } from "./lots.js";

/**
 * Written when the recycler's console pushes the inspected figures to this
 * device (or, offline, when the collector's side records what was agreed).
 * The reference code is derived from the LOT uuid, not the handover uuid, so
 * the QR the collector shows and the code the console looks up are the same
 * string with no round trip.
 */
export async function createHandover(db, p) {
  const id = p.id ?? uuidv7();
  const referenceCode = referenceCodeFromUuid(p.lotId);
  const createdAt = new Date().toISOString();

  await db.$transaction(async (tx) => {
    // upsert with an empty `update` is the Prisma equivalent of INSERT OR
    // IGNORE: a handover already present is left untouched, never rewritten —
    // it is an event, not mutable state.
    await tx.handover.upsert({
      where: { id },
      update: {},
      create: {
        id,
        lotId: p.lotId,
        recyclerId: p.recyclerId,
        referenceCode,
        inspectedQuantity: p.inspectedQuantity,
        finalUnitPrice: p.finalUnitPrice,
        finalTotal: p.finalTotal,
        inspectedCondition: p.inspectedCondition ?? null,
        downgradeReasonCode: p.downgradeReasonCode ?? null,
        collectorProtest: false,
        handoverLat: p.handoverLat ?? null,
        handoverLng: p.handoverLng ?? null,
        handoverTs: p.handoverTs,
        status: "PENDING_COLLECTOR",
        recyclerConfirmedAt: p.recyclerConfirmedAt ?? null,
        collectorConfirmedAt: null,
        createdAt,
      },
    });
    await setLotStatus(tx, p.lotId, "HANDED_OVER");
  });

  return db.handover.findUnique({ where: { lotId: p.lotId } });
}

/**
 * The collector's side of the two-sided confirmation. Recorded locally and
 * enqueued; the record is finalised on this device whether or not there is a
 * network, and syncs later with no warning shown (FRONTEND.md section 3).
 *
 * `protest` is stored separately from the signature. A collector standing at
 * the counter with the material already delivered will sign almost anything —
 * a signature is not agreement (AI-ANOMALY-SPEC edge case 13).
 */
export async function confirmHandover(db, { lotId, agree, protest = false, confirmedAt }) {
  const at = confirmedAt ?? new Date().toISOString();
  const status = agree ? "CONFIRMED" : "DISPUTED";

  await db.$transaction(async (tx) => {
    // Scoped to an unsigned record, so replaying the outbox cannot move a
    // record the collector already closed. updateMany returns a count instead
    // of throwing when nothing matches, which is exactly the idempotent
    // behaviour we want.
    await tx.handover.updateMany({
      where: { lotId, collectorConfirmedAt: null },
      data: { collectorConfirmedAt: at, status, collectorProtest: protest },
    });
    await enqueue(tx, "handover_confirm", lotId, {
      lot_id: lotId,
      agree,
      protest,
      confirmed_at: at,
    });
  });

  return db.handover.findUnique({ where: { lotId } });
}

export async function handoverForLot(db, lotId) {
  return db.handover.findUnique({ where: { lotId } });
}
```

- [ ] **Step 7: Write `client/app/src/db/repos/photos.js`**

```js
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
```

- [ ] **Step 8: Write `client/app/src/db/repos/reference.js`**

```js
/**
 * The cached copy of what /sync/bootstrap returned. Replaceable: if it were
 * lost the app re-fetches it. Everything here is READ by the pricing and
 * ranking path and never authored on the device.
 */
export async function replaceReference(db, snapshot) {
  await db.$transaction(async (tx) => {
    await tx.category.deleteMany();
    for (const c of snapshot.categories) {
      // eslint-disable-next-line no-await-in-loop
      await tx.category.create({
        data: {
          id: c.id,
          code: c.code,
          parentCode: c.parentCode ?? null,
          nameEn: c.nameEn,
          nameMr: c.nameMr,
          nameHi: c.nameHi,
          iconKey: c.iconKey,
          defaultUnit: c.defaultUnit,
          criticalMinerals: JSON.stringify(c.criticalMinerals ?? []),
        },
      });
    }

    await tx.recycler.deleteMany();
    for (const r of snapshot.recyclers) {
      // eslint-disable-next-line no-await-in-loop
      await tx.recycler.create({
        data: {
          id: r.id,
          name: r.name,
          address: r.address ?? null,
          lat: r.lat,
          lng: r.lng,
          district: r.district ?? null,
          phone: r.phone ?? null,
          authorizationStatus: r.authorizationStatus,
          validityTo: r.validityTo ?? null,
          serviceAreaKm: r.serviceAreaKm,
          pickupAvailable: Boolean(r.pickupAvailable),
          materialsAccepted: JSON.stringify(r.materialsAccepted ?? []),
        },
      });
    }

    await tx.rate.deleteMany();
    for (const r of snapshot.rates) {
      // eslint-disable-next-line no-await-in-loop
      await tx.rate.create({
        data: {
          recyclerId: r.recyclerId,
          categoryCode: r.categoryCode,
          unit: r.unit,
          price: r.price,
          validFrom: r.validFrom,
        },
      });
    }

    for (const [condition, factor] of Object.entries(snapshot.conditionFactors ?? {})) {
      // eslint-disable-next-line no-await-in-loop
      await tx.conditionFactor.upsert({
        where: { condition },
        update: { factor },
        create: { condition, factor },
      });
    }

    await tx.meta.upsert({
      where: { key: "last_sync" },
      update: { value: snapshot.serverTime },
      create: { key: "last_sync", value: snapshot.serverTime },
    });
  });
}

export async function loadReference(db) {
  const [categories, recyclers, rates] = await Promise.all([
    db.category.findMany({ orderBy: { code: "asc" } }),
    db.recycler.findMany(),
    db.rate.findMany(),
  ]);
  return {
    // Categories are mapped to the snake_case shape S2 and S3 read, so those
    // screens are untouched by the switch to Prisma. Recyclers keep camelCase
    // because rankRecyclers in @bhaav/core consumes them directly.
    categories: categories.map((c) => ({
      id: c.id,
      code: c.code,
      parent_code: c.parentCode,
      name_en: c.nameEn,
      name_mr: c.nameMr,
      name_hi: c.nameHi,
      icon_key: c.iconKey,
      default_unit: c.defaultUnit,
      criticalMinerals: JSON.parse(c.criticalMinerals),
    })),
    recyclers: recyclers.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      district: r.district,
      phone: r.phone,
      authorizationStatus: r.authorizationStatus,
      serviceAreaKm: r.serviceAreaKm,
      pickupAvailable: Boolean(r.pickupAvailable),
      materialsAccepted: JSON.parse(r.materialsAccepted),
    })),
    rates: rates.map((r) => ({
      recyclerId: r.recyclerId,
      categoryCode: r.categoryCode,
      unit: r.unit,
      price: r.price,
      validFrom: r.validFrom,
    })),
  };
}

/**
 * Age of the freshest cached rate, in whole days. Drives the staleness strip:
 * over 3 days the date is greyed, over 14 an amber strip appears — and the
 * values are still shown either way (FRONTEND.md section 3).
 */
export async function rateAgeDays(db) {
  const rows = await db.rate.findMany({
    select: { validFrom: true },
    orderBy: { validFrom: "desc" },
    take: 1,
  });
  if (rows.length === 0) return null;
  return Math.floor((Date.now() - new Date(rows[0].validFrom).getTime()) / 86_400_000);
}
```

- [ ] **Step 9: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/db/repos.test.js
```

Expected: PASS, 14 tests.

- [ ] **Step 10: Commit**

```bash
git add client/app/src/db/repos client/app/test/db client/app/test/helpers
git commit -m "feat(app): repositories that enqueue an outbox row in the same transaction as every write"
```

---

## Task 4: Audio — pre-recorded clips and number composition

**Every number is spoken.** Weight entered, value shown, rate offered — all read aloud in the chosen language (`FRONTEND.md` §1 rule 3).

**Files:**
- Create: `client/app/src/audio/clips.js`, `client/app/src/audio/speak.js`
- Test: `client/app/test/audio/speak.test.js`

**Interfaces:**
- Produces: `clipsFor(number) -> string[]`, `speak(keys, lang)`, `speakNumber(n, lang)`, `speakRupees(n, lang)`, `speakQuantity(n, unit, lang)`, `CLIP_KEYS`

**Why not TTS.** `expo-speech` uses the OS engine and `mr-IN` voice availability varies by handset (`SERVER.md` §1). A demo where the phone is silent because that particular device has no Marathi voice is a demo that fails on the one feature the brief cares most about. Roughly 60 clips, one hour of recording, guaranteed offline, guaranteed on any device.

**Update (2026-09-08): the risk above was realised, for the half of the audio this task did not cover.** Numbers, categories, units and conditions shipped as clips, as planned here — and they worked in all three languages. Screen headings and spoken status lines did not: they went through `expo-speech` via `useVoice().speak(t(key))`, so they were audible in English only. The device-default-voice fallback in `useVoice.js` was written on the assumption that a wrong-language accent still beats silence; that does not hold for Devanagari, because an English voice handed `प्रकार` says nothing at all. Headings and status phrases are now bundled clips too — `src/audio/phrases.js`, generated by `scripts/generate-clips.sh <lang> phrases`, and played through `useVoice().speakKey(key, params)`. TTS remains only as the fallback for keys with no recording, and now logs a warning when handed script the chosen voice cannot render, so the next silent string shows up in the log instead of disappearing on the device. `test/audio/spoken-keys.test.js` fails the build if a spoken key has no recording. See `docs/superpowers/plans/2026-09-08-marathi-hindi-voice-headings.md`.

- [ ] **Step 1: Write the failing test**

`client/app/test/audio/speak.test.js`:

```js
import { clipsFor, CLIP_KEYS, numberToClipKeys, quantityClipKeys, rupeeClipKeys } from "../../src/audio/speak.js";

describe("numberToClipKeys", () => {
  it("reads a single digit", () => {
    expect(numberToClipKeys(7)).toEqual(["d7"]);
  });

  it("reads a multi-digit number digit by digit", () => {
    // Digit-by-digit is deliberate: it needs 10 clips rather than the ~100
    // a natural Marathi number system would, and a collector reading a price
    // board follows the digits either way.
    expect(numberToClipKeys(1260)).toEqual(["d1", "d2", "d6", "d0"]);
  });

  it("reads a decimal with the point clip between the parts", () => {
    expect(numberToClipKeys(3.5)).toEqual(["d3", "point", "d5"]);
  });

  it("truncates to two decimal places", () => {
    expect(numberToClipKeys(3.456)).toEqual(["d3", "point", "d4", "d6"]);
  });

  it("drops a trailing zero decimal — nobody says three point zero", () => {
    expect(numberToClipKeys(3.0)).toEqual(["d3"]);
  });

  it("handles zero", () => {
    expect(numberToClipKeys(0)).toEqual(["d0"]);
  });
});

describe("rupeeClipKeys", () => {
  it("appends the rupees clip after the digits", () => {
    expect(rupeeClipKeys(1260)).toEqual(["d1", "d2", "d6", "d0", "rupees"]);
  });
});

describe("quantityClipKeys", () => {
  it("appends kilo for KG", () => {
    expect(quantityClipKeys(3, "KG")).toEqual(["d3", "kilo"]);
  });

  it("appends piece for PIECE", () => {
    expect(quantityClipKeys(2, "PIECE")).toEqual(["d2", "piece"]);
  });
});

describe("clipsFor", () => {
  it("resolves every key in the manifest", () => {
    for (const key of CLIP_KEYS) {
      expect(clipsFor([key], "mr")).toHaveLength(1);
    }
  });

  it("skips a key with no recording rather than crashing the screen", () => {
    // Audio is never mandatory: every spoken cue has a visible equivalent
    // (FRONTEND.md section 6), so a missing clip must degrade silently.
    expect(clipsFor(["no_such_key"], "mr")).toEqual([]);
  });
});
```

- [ ] **Step 2: Write `client/app/src/audio/clips.js`**

```js
// The recording list. README open item 6: roughly 60 clips per language —
// 8 category names, digits 0-9, "rupees", "kilo", "piece", "point",
// "correct", "wrong", and the screen phrases.
//
// Record as mono 44.1 kHz m4a. Keep each clip tight: no leading silence, no
// trailing breath, or a spoken price sounds like a stutter.
//
// Until a real recording exists, a file must still be present or Metro fails
// the bundle. Ship a 200 ms silent m4a for any clip not yet recorded and
// track what is outstanding in README open item 6.

export const CLIP_KEYS = [
  "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9",
  "point", "rupees", "kilo", "piece",
  "cat_cable", "cat_pcb", "cat_panel", "cat_crt",
  "cat_battery", "cat_motor", "cat_plastic", "cat_other",
  "sub_pcb_computer", "sub_pcb_appliance",
  "sub_battery_phone", "sub_battery_inverter",
  "sub_panel_laptop", "sub_panel_tv",
  "sub_motor_hdd", "sub_motor_fan",
  "cond_good", "cond_fair", "cond_poor",
  "correct", "wrong",
  "ask_which_board", "ask_which_battery", "ask_which_screen", "ask_which_part",
  "dont_know",
  "new_lot", "todays_earnings", "price_board",
  "take_photo", "choose_category", "enter_quantity", "choose_condition",
  "where_from", "estimated_value", "recommended", "authorised",
  "accepted_you_can_go_now", "pending", "received",
  "rates_are_old", "safety",
];

// Static requires: Metro resolves these at bundle time, so the files ship
// inside the APK and no clip is ever fetched.
export const CLIPS = {
  mr: {
    d0: require("../../assets/audio/mr/d0.m4a"),
    d1: require("../../assets/audio/mr/d1.m4a"),
    d2: require("../../assets/audio/mr/d2.m4a"),
    d3: require("../../assets/audio/mr/d3.m4a"),
    d4: require("../../assets/audio/mr/d4.m4a"),
    d5: require("../../assets/audio/mr/d5.m4a"),
    d6: require("../../assets/audio/mr/d6.m4a"),
    d7: require("../../assets/audio/mr/d7.m4a"),
    d8: require("../../assets/audio/mr/d8.m4a"),
    d9: require("../../assets/audio/mr/d9.m4a"),
    point: require("../../assets/audio/mr/point.m4a"),
    rupees: require("../../assets/audio/mr/rupees.m4a"),
    kilo: require("../../assets/audio/mr/kilo.m4a"),
    piece: require("../../assets/audio/mr/piece.m4a"),
    cat_cable: require("../../assets/audio/mr/cat_cable.m4a"),
    cat_pcb: require("../../assets/audio/mr/cat_pcb.m4a"),
    cat_panel: require("../../assets/audio/mr/cat_panel.m4a"),
    cat_crt: require("../../assets/audio/mr/cat_crt.m4a"),
    cat_battery: require("../../assets/audio/mr/cat_battery.m4a"),
    cat_motor: require("../../assets/audio/mr/cat_motor.m4a"),
    cat_plastic: require("../../assets/audio/mr/cat_plastic.m4a"),
    cat_other: require("../../assets/audio/mr/cat_other.m4a"),
    sub_pcb_computer: require("../../assets/audio/mr/sub_pcb_computer.m4a"),
    sub_pcb_appliance: require("../../assets/audio/mr/sub_pcb_appliance.m4a"),
    sub_battery_phone: require("../../assets/audio/mr/sub_battery_phone.m4a"),
    sub_battery_inverter: require("../../assets/audio/mr/sub_battery_inverter.m4a"),
    sub_panel_laptop: require("../../assets/audio/mr/sub_panel_laptop.m4a"),
    sub_panel_tv: require("../../assets/audio/mr/sub_panel_tv.m4a"),
    sub_motor_hdd: require("../../assets/audio/mr/sub_motor_hdd.m4a"),
    sub_motor_fan: require("../../assets/audio/mr/sub_motor_fan.m4a"),
    cond_good: require("../../assets/audio/mr/cond_good.m4a"),
    cond_fair: require("../../assets/audio/mr/cond_fair.m4a"),
    cond_poor: require("../../assets/audio/mr/cond_poor.m4a"),
    correct: require("../../assets/audio/mr/correct.m4a"),
    wrong: require("../../assets/audio/mr/wrong.m4a"),
    ask_which_board: require("../../assets/audio/mr/ask_which_board.m4a"),
    ask_which_battery: require("../../assets/audio/mr/ask_which_battery.m4a"),
    ask_which_screen: require("../../assets/audio/mr/ask_which_screen.m4a"),
    ask_which_part: require("../../assets/audio/mr/ask_which_part.m4a"),
    dont_know: require("../../assets/audio/mr/dont_know.m4a"),
    new_lot: require("../../assets/audio/mr/new_lot.m4a"),
    todays_earnings: require("../../assets/audio/mr/todays_earnings.m4a"),
    price_board: require("../../assets/audio/mr/price_board.m4a"),
    take_photo: require("../../assets/audio/mr/take_photo.m4a"),
    choose_category: require("../../assets/audio/mr/choose_category.m4a"),
    enter_quantity: require("../../assets/audio/mr/enter_quantity.m4a"),
    choose_condition: require("../../assets/audio/mr/choose_condition.m4a"),
    where_from: require("../../assets/audio/mr/where_from.m4a"),
    estimated_value: require("../../assets/audio/mr/estimated_value.m4a"),
    recommended: require("../../assets/audio/mr/recommended.m4a"),
    authorised: require("../../assets/audio/mr/authorised.m4a"),
    accepted_you_can_go_now: require("../../assets/audio/mr/accepted_you_can_go_now.m4a"),
    pending: require("../../assets/audio/mr/pending.m4a"),
    received: require("../../assets/audio/mr/received.m4a"),
    rates_are_old: require("../../assets/audio/mr/rates_are_old.m4a"),
    safety: require("../../assets/audio/mr/safety.m4a"),
  },
  hi: {},
};

// Hindi mirrors the Marathi manifest exactly. Build it by mapping the same
// keys at the hi/ path rather than repeating the list, so a key added to
// CLIP_KEYS cannot be forgotten in one language.
for (const key of CLIP_KEYS) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    CLIPS.hi[key] = require(`../../assets/audio/hi/${key}.m4a`);
  } catch {
    CLIPS.hi[key] = null;
  }
}
```

> **Metro cannot resolve a template-literal `require`.** If the loop above fails at bundle time, replace it with an explicit map mirroring the Marathi block, path-for-path. Do not fall back to fetching the clips at runtime — they must be in the APK.

- [ ] **Step 3: Write `client/app/src/audio/speak.js`**

```js
import { createAudioPlayer } from "expo-audio";
import { CLIPS, CLIP_KEYS } from "./clips.js";

export { CLIP_KEYS };

/**
 * Numbers are read DIGIT BY DIGIT. Ten clips cover every number the app will
 * ever say; a natural Marathi number system would need close to a hundred
 * recordings and an hour of studio time we do not have. A collector following
 * a price board reads the digits either way.
 */
export function numberToClipKeys(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return [];

  const fixed = Math.abs(value).toFixed(2);
  const [whole, frac] = fixed.split(".");
  const keys = [...whole].map((d) => `d${d}`);

  // "three point zero" is not something anyone says.
  if (frac !== "00") {
    keys.push("point");
    const trimmed = frac.replace(/0+$/, "");
    keys.push(...[...trimmed].map((d) => `d${d}`));
  }
  return keys;
}

export function rupeeClipKeys(n) {
  return [...numberToClipKeys(n), "rupees"];
}

export function quantityClipKeys(n, unit) {
  return [...numberToClipKeys(n), unit === "PIECE" ? "piece" : "kilo"];
}

export function clipsFor(keys, lang) {
  const table = CLIPS[lang] ?? CLIPS.mr;
  return keys.map((k) => table[k]).filter(Boolean);
}

let queue = [];
let playing = false;

/**
 * Plays clips in sequence. A new call REPLACES the queue rather than appending
 * to it: tapping three category icons quickly should say the third name, not
 * all three in a row.
 *
 * Audio is never mandatory. Every spoken cue has a visible equivalent
 * (FRONTEND.md section 6), so any failure here is swallowed — the screen keeps
 * working in silence.
 */
export async function speak(keys, lang = "mr") {
  queue = clipsFor(keys, lang);
  if (playing) return;
  playing = true;
  try {
    while (queue.length > 0) {
      const source = queue.shift();
      // eslint-disable-next-line no-await-in-loop
      await playOne(source);
    }
  } catch {
    // deliberate: silence beats a crash on a screen the collector is mid-task on
  } finally {
    playing = false;
  }
}

function playOne(source) {
  return new Promise((resolve) => {
    let player;
    try {
      player = createAudioPlayer(source);
    } catch {
      resolve();
      return;
    }
    const done = () => {
      try {
        player.remove();
      } catch {
        /* already released */
      }
      resolve();
    };
    player.addListener("playbackStatusUpdate", (status) => {
      if (status?.didJustFinish) done();
    });
    try {
      player.play();
    } catch {
      done();
    }
    // Hard ceiling so a clip that never reports completion cannot wedge the
    // queue and leave the app permanently silent.
    setTimeout(done, 4000);
  });
}

export const speakNumber = (n, lang) => speak(numberToClipKeys(n), lang);
export const speakRupees = (n, lang) => speak(rupeeClipKeys(n), lang);
export const speakQuantity = (n, unit, lang) => speak(quantityClipKeys(n, unit), lang);
export const speakKey = (key, lang) => speak([key], lang);
```

- [ ] **Step 4: Create placeholder clips so the bundle resolves**

```bash
cd client/app && mkdir -p assets/audio/mr assets/audio/hi
node -e '
const fs=require("fs");
const keys=require("./src/audio/clips.js");
' 2>/dev/null || true
# 200ms of silence, one file per key, both languages
for k in d0 d1 d2 d3 d4 d5 d6 d7 d8 d9 point rupees kilo piece \
  cat_cable cat_pcb cat_panel cat_crt cat_battery cat_motor cat_plastic cat_other \
  sub_pcb_computer sub_pcb_appliance sub_battery_phone sub_battery_inverter \
  sub_panel_laptop sub_panel_tv sub_motor_hdd sub_motor_fan \
  cond_good cond_fair cond_poor correct wrong \
  ask_which_board ask_which_battery ask_which_screen ask_which_part dont_know \
  new_lot todays_earnings price_board take_photo choose_category enter_quantity \
  choose_condition where_from estimated_value recommended authorised \
  accepted_you_can_go_now pending received rates_are_old safety; do
  ffmpeg -loglevel error -f lavfi -i anullsrc=r=44100:cl=mono -t 0.2 -c:a aac -y "assets/audio/mr/$k.m4a"
  cp "assets/audio/mr/$k.m4a" "assets/audio/hi/$k.m4a"
done
ls assets/audio/mr | wc -l
```

Expected: `58`. If `ffmpeg` is missing, `brew install ffmpeg`.

> **These are placeholders and the app must not ship with them.** README open item 6 owns replacing them with real recordings. Add a one-line note to that item recording that placeholders exist so nobody mistakes a silent app for a broken one.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/audio/speak.test.js
```

Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add client/app/src/audio client/app/assets/audio client/app/test/audio
git commit -m "feat(app): pre-recorded audio with digit-by-digit number composition

expo-speech is not used: mr-IN voice availability varies by handset, and a
silent demo would fail on the feature the brief cares most about."
```

---

## Task 5: Strings and the language context

**Files:**
- Create: `client/app/src/i18n/strings.js`, `client/app/src/i18n/useLang.js`
- Test: `client/app/test/i18n/strings.test.js`

**Interfaces:**
- Produces: `STRINGS.mr`, `STRINGS.hi`, `t(key, lang)`, `<LangProvider>`, `useLang() -> { lang, setLang, t, speak }`

- [ ] **Step 1: Write the failing test**

`client/app/test/i18n/strings.test.js`:

```js
import { STRINGS, t, STRING_KEYS } from "../../src/i18n/strings.js";

describe("string table", () => {
  it("covers Marathi and Hindi", () => {
    expect(Object.keys(STRINGS).sort()).toEqual(["hi", "mr"]);
  });

  it("has no key missing in either language", () => {
    const missing = [];
    for (const key of STRING_KEYS) {
      if (!STRINGS.mr[key]) missing.push(`mr:${key}`);
      if (!STRINGS.hi[key]) missing.push(`hi:${key}`);
    }
    expect(missing).toEqual([]);
  });

  it("returns the Marathi string", () => {
    expect(t("new_lot", "mr")).toBe("नवीन लॉट");
  });

  it("returns the Hindi string", () => {
    expect(t("new_lot", "hi")).toBe("नया लॉट");
  });

  it("returns the key itself for an unknown string rather than blank", () => {
    expect(t("no_such_key", "mr")).toBe("no_such_key");
  });

  it("carries the line the collector must see after accepting", () => {
    expect(t("you_can_go_now", "mr")).toBe("तुम्ही आत्ता जाऊ शकता.");
  });
});
```

- [ ] **Step 2: Write `client/app/src/i18n/strings.js`**

```js
// Every user-facing string in the collector flow. No free text is ever
// entered, so this table is the complete vocabulary of the app.
//
// Marathi and Hindi are both brief requirements. Keys are shared with the
// audio manifest wherever a string is also spoken, so a phrase cannot be
// written one way and recorded another.

export const STRINGS = {
  mr: {
    app_name: "भाव",
    new_lot: "नवीन लॉट",
    todays_earnings: "आजची कमाई",
    price_board: "भाव",
    safety: "सुरक्षा",
    synced: "अद्ययावत",
    pending_n: "बाकी",
    take_photo: "फोटो काढा",
    photos_added: "फोटो",
    choose_category: "काय आहे?",
    cat_cable: "तार",
    cat_pcb: "सर्किट बोर्ड",
    cat_panel: "स्क्रीन",
    cat_crt: "जुना टीव्ही",
    cat_battery: "बॅटरी",
    cat_motor: "मोटर",
    cat_plastic: "प्लास्टिक",
    cat_other: "इतर",
    ask_which_board: "कोणता बोर्ड?",
    ask_which_battery: "कोणती बॅटरी?",
    ask_which_screen: "कोणती स्क्रीन?",
    ask_which_part: "कोणता भाग?",
    sub_pcb_computer: "कॉम्प्युटर बोर्ड",
    sub_pcb_appliance: "टीव्ही बोर्ड",
    sub_battery_phone: "फोन बॅटरी",
    sub_battery_inverter: "इन्व्हर्टर बॅटरी",
    sub_panel_laptop: "लॅपटॉप स्क्रीन",
    sub_panel_tv: "टीव्ही स्क्रीन",
    sub_motor_hdd: "हार्ड डिस्क",
    sub_motor_fan: "पंखा मोटर",
    dont_know: "मला माहीत नाही",
    unit_kg: "किलो",
    unit_piece: "नग",
    enter_quantity: "किती?",
    choose_condition: "स्थिती?",
    cond_good: "चांगली",
    cond_fair: "ठीक",
    cond_poor: "खराब",
    where_from: "कुठून आले?",
    src_household: "घर",
    src_shop: "दुकान",
    src_office: "ऑफिस",
    src_institutional: "संस्था",
    src_street: "रस्ता",
    src_other: "इतर",
    skip: "वगळा",
    estimated: "अंदाजे",
    recommended: "सुचवलेले",
    authorised: "अधिकृत",
    pickup_available: "पिकअप उपलब्ध",
    accepts_this: "घेतात",
    sort_best: "सर्वोत्तम",
    sort_value: "जास्त भाव",
    sort_distance: "जवळचे",
    accept: "स्वीकारा",
    accepted: "स्वीकारले",
    you_can_go_now: "तुम्ही आत्ता जाऊ शकता.",
    will_be_told: "ला कळवले जाईल.",
    correct: "बरोबर",
    wrong: "चूक",
    amount_to_record: "ही रक्कम नोंदवली जाईल",
    received: "मिळाले",
    pending: "बाकी",
    this_week: "या आठवड्यात",
    this_month: "या महिन्यात",
    rate_date: "भाव",
    rates_are_old: "भाव जुने आहेत",
    no_recyclers: "जवळ कोणी अधिकृत खरेदीदार नाही",
    km: "किमी",
    back: "मागे",
    next: "पुढे",
    language: "भाषा",
    no_lots_yet: "अजून काही नाही",
    protest: "मला मान्य नाही",
  },
  hi: {
    app_name: "भाव",
    new_lot: "नया लॉट",
    todays_earnings: "आज की कमाई",
    price_board: "भाव",
    safety: "सुरक्षा",
    synced: "अपडेटेड",
    pending_n: "बाकी",
    take_photo: "फोटो लें",
    photos_added: "फोटो",
    choose_category: "क्या है?",
    cat_cable: "तार",
    cat_pcb: "सर्किट बोर्ड",
    cat_panel: "स्क्रीन",
    cat_crt: "पुराना टीवी",
    cat_battery: "बैटरी",
    cat_motor: "मोटर",
    cat_plastic: "प्लास्टिक",
    cat_other: "अन्य",
    ask_which_board: "कौन सा बोर्ड?",
    ask_which_battery: "कौन सी बैटरी?",
    ask_which_screen: "कौन सी स्क्रीन?",
    ask_which_part: "कौन सा हिस्सा?",
    sub_pcb_computer: "कंप्यूटर बोर्ड",
    sub_pcb_appliance: "टीवी बोर्ड",
    sub_battery_phone: "फोन बैटरी",
    sub_battery_inverter: "इन्वर्टर बैटरी",
    sub_panel_laptop: "लैपटॉप स्क्रीन",
    sub_panel_tv: "टीवी स्क्रीन",
    sub_motor_hdd: "हार्ड डिस्क",
    sub_motor_fan: "पंखा मोटर",
    dont_know: "मुझे नहीं पता",
    unit_kg: "किलो",
    unit_piece: "नग",
    enter_quantity: "कितना?",
    choose_condition: "हालत?",
    cond_good: "अच्छी",
    cond_fair: "ठीक",
    cond_poor: "खराब",
    where_from: "कहाँ से आया?",
    src_household: "घर",
    src_shop: "दुकान",
    src_office: "ऑफिस",
    src_institutional: "संस्था",
    src_street: "सड़क",
    src_other: "अन्य",
    skip: "छोड़ें",
    estimated: "अनुमानित",
    recommended: "सुझाया गया",
    authorised: "अधिकृत",
    pickup_available: "पिकअप उपलब्ध",
    accepts_this: "लेते हैं",
    sort_best: "सर्वोत्तम",
    sort_value: "ज़्यादा भाव",
    sort_distance: "नज़दीक",
    accept: "स्वीकारें",
    accepted: "स्वीकार किया",
    you_can_go_now: "आप अभी जा सकते हैं.",
    will_be_told: "को बता दिया जाएगा.",
    correct: "सही",
    wrong: "गलत",
    amount_to_record: "यह रकम दर्ज होगी",
    received: "मिल गया",
    pending: "बाकी",
    this_week: "इस हफ़्ते",
    this_month: "इस महीने",
    rate_date: "भाव",
    rates_are_old: "भाव पुराने हैं",
    no_recyclers: "पास कोई अधिकृत खरीदार नहीं",
    km: "किमी",
    back: "पीछे",
    next: "आगे",
    language: "भाषा",
    no_lots_yet: "अभी कुछ नहीं",
    protest: "मुझे मंज़ूर नहीं",
  },
};

export const STRING_KEYS = Object.keys(STRINGS.mr);

export function t(key, lang = "mr") {
  return STRINGS[lang]?.[key] ?? STRINGS.mr[key] ?? key;
}
```

- [ ] **Step 3: Write `client/app/src/i18n/useLang.js`**

```js
import { createContext, useContext, useMemo, useState, useCallback } from "react";
import { t as translate } from "./strings.js";
import { speak as playClips } from "../audio/speak.js";

const LangContext = createContext(null);

/**
 * Language is chosen once on first open and changed from the ledger screen
 * (FRONTEND.md section 1). It is held in memory and persisted to the
 * `collector` row, because the collector's preferred language IS a column on
 * that table and there is nowhere else it belongs.
 */
export function LangProvider({ initial = "mr", onChange, children }) {
  const [lang, setLangState] = useState(initial);

  const setLang = useCallback(
    (next) => {
      setLangState(next);
      onChange?.(next);
    },
    [onChange],
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (key) => translate(key, lang),
      speak: (keys) => playClips(Array.isArray(keys) ? keys : [keys], lang),
    }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd client/app && npx jest test/i18n/strings.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add client/app/src/i18n client/app/test/i18n
git commit -m "feat(app): complete marathi and hindi string table with a language context"
```

---

**Tasks 6–21 continue in [part 2](2026-09-01-02b-collector-app-screens.md):** design tokens and primitives (6), the eight drawn category icons (7), S0 Home (8), S1 Camera (9), S2 Category grid (10), S3 Sub-category (11), S4 Quantity (12), S4b Condition (13), S4c Source (14), S5 Value and ranked recyclers (15), S6 Accept (16), S7 Handover with QR and two-sided confirm (17), S8 Ledger (18), Price board (19), Safety cards (20), and the sync engine with the pending pill and staleness indicators (21).
