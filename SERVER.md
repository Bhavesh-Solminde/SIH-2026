# Server Specification — SIH26229

**Problem statement:** SIH26229, Kabadiwala Connect (Ministry of Mines / JNARDDC)
**Companion documents:** `FRONTEND.md`, `AI.md`

The server is deliberately small. Three read endpoints, one write endpoint, and a console API. Everything difficult in this project lives on the device, not here.

---

## 1. Stack — decided

| Layer | Choice |
|---|---|
| API | **Express (Node)** |
| Database | **PostgreSQL** |
| ORM / migrations | **Prisma** if anyone on the team knows it; otherwise raw `pg` against a single `schema.sql` |
| Collector app | **React Native via Expo** (dev build) |
| Device DB | **SQLite via `expo-sqlite`**, raw SQL |
| Console | **Next.js**, against the same Express API |
| Photo storage | Local disk + static serve for the hackathon; S3-compatible later |

### Why Postgres and not MongoDB

1. **The device DB is SQLite, which is also relational.** SQLite → Postgres is close to a 1:1 schema mapping. SQLite → MongoDB means maintaining a translation layer between a relational local store and a document server, for no benefit.
2. **The data is joins.** `lot → acceptance → handover → recycler → rate → category`.
3. **The two-sided confirmation belongs in a database constraint**, not in application code (§3, `handover`). In a document store that rule holds only where someone remembered to write it.
4. **The anomaly detectors were designed as SQL** — window functions and percentiles over the transaction tables (§10 shows the original design). **As built, they run as pure Python functions in a separate stateless service, `server/aiml`** (FastAPI, `POST /detect`), not as literal queries in this API — see `AI.md` §11 for the contract and §10 below for why the SQL framing is still worth understanding even though it is not what ships.

Plus `COPY` imports `mpcb_recyclers.csv` directly.

### Notes on the client

- **Expo covers everything needed** without native module work: `expo-camera`, `expo-sqlite`, `expo-location`, `expo-file-system`, and a QR scanner. Bare React Native buys nothing here and costs a day of configuration.
- **Write the outbox by hand with `expo-sqlite` and raw SQL** — roughly a hundred lines, fully under your control. WatermelonDB has a sync protocol built in and is a good fit in principle, but only take it if someone has already used it; learning its schema and sync contract mid-sprint costs more than it saves.
- **Do not rely on device text-to-speech for the Marathi audio.** `expo-speech` uses the OS engine and `mr-IN` voice availability varies by handset. **Ship pre-recorded audio in the app bundle** for the fixed strings — seven category names, digits 0–9, "rupees", "kilo", "correct", "wrong", and the screen phrases. Numbers compose from digit clips. An hour of recording, guaranteed offline, guaranteed on any device. Use TTS only as an enhancement for anything not pre-recorded.

---

## 2. The offline contract

This is the core of the system and the thing the brief actually asks for. Four rules.

### 2.1 Local first

Every write commits to the device's SQLite database and the UI advances **immediately**. No screen in the collector flow awaits a network call. The server is a synchronisation target, never a dependency.

### 2.2 Client-generated identity

Every record gets a **UUID generated on the device** at creation time. No step requires a server round-trip to obtain an identity. This is what makes the entire chain work at zero bars.

Use UUIDv7 (time-ordered) so records sort naturally and index well.

### 2.3 The outbox

An append-only local table:

```sql
outbox(
  id            TEXT PRIMARY KEY,   -- uuid
  entity_type   TEXT NOT NULL,      -- lot | acceptance | handover | photo
  entity_id     TEXT NOT NULL,
  payload       TEXT NOT NULL,      -- json
  created_at    TEXT NOT NULL,
  attempts      INTEGER DEFAULT 0,
  synced_at     TEXT                -- NULL until acknowledged
)
```

Sync is a single batched `POST` of every row where `synced_at IS NULL`. The server upserts by the record's UUID, so **replaying the batch is harmless**. Idempotent by construction — this is the answer when a judge asks about duplicates.

### 2.4 Immutable events

A handover record is a **statement about something that happened**, not mutable state. It is append-only. Corrections are new records that reference the corrected one.

Consequence: conflict resolution is trivial, because two devices can never disagree about the same fact. Say this in exactly these words if asked about sync conflicts — it demonstrates the model was chosen, not defaulted to.

**Photos sync separately and later.** A record is valid before its photograph has uploaded.

---

## 3. Data model

Maps one-to-one onto the six datasets the problem statement requires.

### `collector` → *Collector Dataset*
```
id                uuid pk        -- pseudonymous, device-generated
preferred_language text          -- mr | hi
operating_area    text           -- ward or locality, coarse. NOT an address
created_at        timestamptz
```
**No name. No Aadhaar. No phone number required.** The brief says avoid unnecessary personal information; this table is the evidence that we did.

### `recycler` → *Recycler Dataset*
```
id                    uuid pk
name                  text
address               text
lat, lng              double        -- geocoded once, ships in the app
type                  text          -- Recycler | Dismantler
capacity_mta          integer
registration_no       text
validity_to           date
authorization_status  text          -- VALID | LAPSED_IN_LIST
phone, email          text
service_area_km       integer
pickup_available      boolean
materials_accepted    text[]        -- category codes
```
Seeded from `mpcb_recyclers.csv` (161 rows parsed from the MPCB published list; **74** currently valid). **`GET /recyclers` returns only `authorization_status = VALID`.**

> `LAPSED_IN_LIST` means the *published record* shows an expired validity date — not that the facility is operating unlawfully. Many will have renewed without the PDF being updated. Never present it as the latter.

### `material_category` → *Material Dataset*
```
id              uuid pk
code            text unique       -- CABLE, PCB, PANEL, CRT, BATTERY, MOTOR, PLASTIC, OTHER
parent_id       uuid null         -- sub-categories point at their parent
name_en/mr/hi   text
icon_key        text
default_unit    text              -- kg | piece
critical_minerals text[]          -- lithium, cobalt, neodymium, tantalum, gallium, indium
expected_weight_min/max  numeric  -- populated from field data; feeds anomaly detector 4
```
The `critical_minerals` column is not decoration — it is why the Ministry of Mines commissioned this statement, and it drives one line of the pitch.

### `rate` → *Price Dataset*
```
id            uuid pk
recycler_id   uuid fk
category_id   uuid fk
unit          text            -- kg | piece
price         numeric
source        text            -- RECYCLER_PUBLISHED | FIELD_COLLECTED | MARKET_INDICATIVE
location      text
valid_from    timestamptz
created_at    timestamptz
```
**Append-only. Never update a rate row — insert a new one.** The history *is* the price dataset, and it is what makes trends and detector 3 (bait pricing) possible.

`source` must be honest on every row. Field-collected rates are labelled as such and carry their location and date.

### `lot` → *Material + Transaction Dataset*
```
id                  uuid pk       -- device-generated
collector_id        uuid fk
category_id         uuid fk       -- the LEAF category (sub-category when chosen). No separate column
unit                text          -- KG | PIECE
quantity            numeric
condition           text NOT NULL -- GOOD | FAIR | POOR. Brief-required, no "unknown"
source_type         text null     -- HOUSEHOLD | SHOP | OFFICE | INSTITUTIONAL | STREET | OTHER
estimated_value     numeric
collection_lat/lng  double
collection_ts       timestamptz
status              text          -- DRAFT | ACCEPTED | HANDED_OVER | CANCELLED
device_id           text
created_at          timestamptz
```

`condition` and `source_type` are both named in the brief's Material Dataset. `condition` adjusts the estimate through the `condition_factor` lookup table (defaults 1.0 / 0.85 / 0.70 — a stated assumption, not a measurement). Full DDL and rationale in `DB.md` §3.5.

### `acceptance`
```
id              uuid pk
lot_id          uuid fk
recycler_id     uuid fk
accepted_rate   numeric        -- the published rate at the moment of acceptance
accepted_ts     timestamptz
recycler_response text         -- NONE | ACKNOWLEDGED | DECLINED
response_ts     timestamptz null
```
`accepted_rate` is frozen here. It is the second of the three prices and it must not be recomputed later.

### `handover` → *Traceability Dataset*
```
id                     uuid pk
lot_id                 uuid fk
recycler_id            uuid fk
inspected_quantity     numeric
final_unit_price       numeric
final_total            numeric
handover_lat/lng       double
handover_ts            timestamptz
reference_code         text unique     -- short, human-readable, on the QR
recycler_confirmed_at  timestamptz
collector_confirmed_at timestamptz
```

**A handover cannot reach `CONFIRMED` without both signatures** — enforced by the database, not trusted to the UI:

```sql
ALTER TABLE handover ADD CONSTRAINT handover_confirmed_needs_both_signatures CHECK (
  status <> 'CONFIRMED'
  OR (recycler_confirmed_at IS NOT NULL AND collector_confirmed_at IS NOT NULL)
);
```

> **Corrected.** An earlier draft of this file required both timestamps to be null or both set. That would have blocked the real flow, in which the recycler submits first and the collector confirms a moment later — the intermediate state is legitimate. The version above permits it and still guarantees a `CONFIRMED` record carries both signatures.

This constraint *is* the two-sided signature. It is the project's headline integrity claim, so it lives in the schema where it cannot be bypassed — not in a route handler where it holds only as long as someone remembers it. If you use Prisma, add it as a raw migration; Prisma's schema language does not express multi-column CHECKs.

**`DB.md` is the authoritative schema.** Where this file and `DB.md` disagree, `DB.md` wins.

### `photo`
```
id           uuid pk
lot_id       uuid fk
kind         text        -- LOT | HANDOVER
sha256       text        -- integrity, and cheap duplicate detection
bytes        integer
uploaded_at  timestamptz null
```

### `anomaly_flag`
```
id            uuid pk
subject_type  text     -- LOT | HANDOVER | RECYCLER | COLLECTOR
subject_id    uuid
detector_code text     -- one of D1, D2, D3, D6, D7, D8, D9, D10, D11, D12, D13, see AI.md §5.
                       -- D4/D5 are registered but permanently skip and never write a row here;
                       -- D14 was never built.
severity      text     -- INFO | WARN | CRITICAL
detail        jsonb    -- the numbers that triggered it
created_at    timestamptz
resolved_at   timestamptz null
```

---

## 4. API

### Device
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/sync/bootstrap` | Categories, valid recyclers, current rates, icon/audio manifest. First run |
| `GET` | `/sync/delta?since=<ts>` | Everything changed since a timestamp. Small payload, called on every reconnect |
| `POST` | `/sync/push` | Batched outbox. Idempotent upsert by UUID. Returns applied ids |
| `POST` | `/photos` | Multipart, deferred, one photo per call |
| `POST` | `/handover/{lot_id}/confirm` | Collector's side of the two-sided confirmation |

### Console
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/recycler/rates` | Publish rates. Inserts new `rate` rows, never updates |
| `GET` | `/recycler/acceptances` | Incoming, with response actions |
| `POST` | `/recycler/acceptances/{id}/respond` | Acknowledge or decline |
| `GET` | `/lots/{reference_code}` | Lookup by QR |
| `POST` | `/handover` | Recycler submits inspected quantity + final price |
| `GET` | `/recycler/history?from=&to=` | Completed handovers, CSV export |
| `GET` | `/recycler/flags` | Anomalies on this recycler's transactions. Excludes `INFO` severity by default — `?includeInfo=1` returns all |
| `POST` | `/detect-run` | Operator-triggered detection run, backing the console's "Run detection" button |
| `POST` | `/public/collector/:id/contact` | Collector opts in to SMS with a phone number. No auth — the collector is pseudonymous |
| `DELETE` | `/public/collector/:id/contact` | Erase the opted-in number. Idempotent |
| `GET` | `/public/authorisation` | Counts backing the authorisation-evidence panel: how many MPCB-listed facilities are currently valid vs. lapsed, and when the list was last refreshed |

### `POST /sync/push` — the one that matters

```jsonc
{
  "device_id": "…",
  "records": [
    { "type": "lot",        "id": "018f…", "payload": { … } },
    { "type": "acceptance", "id": "018f…", "payload": { … } },
    { "type": "handover",   "id": "018f…", "payload": { … } }
  ]
}
```

Response returns `applied` and `rejected` id arrays. The device marks `synced_at` only for `applied`. Rejected records stay in the outbox with an incremented `attempts` and a reason.

**Server rules:** upsert by id; never mutate an existing `handover`; ignore a record already present with identical content; reject a record whose `lot_id` is unknown *and* not present in the same batch.

---

## 5. Auth

- **Collector app: none.** No login, no password, no OTP. A device-generated collector UUID plus a device key issued at bootstrap is the entire identity model. This is a deliberate privacy decision, not a shortcut, and it should be stated as one.
- **Recycler console:** email + password over HTTPS, sessions server-side. One account per authorised facility.
- **The device key is not a person.** Losing the phone loses the local history until it syncs; it does not expose an identity.

---

## 6. Privacy and data protection

- **No personal data is collected from collectors.** No name, no Aadhaar, no mandatory phone number, no face photographs. The collector is a pseudonymous UUID with a coarse operating area.
- Because no identifiable personal data is stored, the bulk of DPDP Act 2023 obligations do not attach in the first place. **Say that sentence; do not claim "DPDP compliant" as a blanket.**
- Recycler contact details come from a **published government register** (MPCB). Public data, cited with its source URL and download date.
- Field research audio and photographs are collected **with recorded verbal consent**, no faces without asking, and stored separately from the application database.
- Photographs of *material* are not personal data. Photographs of *people* are — so don't take them.

### 6.1 SMS notifications — `server/api/src/lib/sms.js`

Built today, and it changes an earlier "not built" answer: **SMS notifications now exist.**

- **Provider:** Fast2SMS, route `q` (Quick SMS) — no DLT sender-ID registration needed. Route `dlt` is the production path (a DLT-approved sender ID plus an approved template) and is **explicitly out of scope** for this build.
- **Recycler is notified on acceptance**, on both paths: the online `POST /public/lots` flow and the offline `/sync/push` outbox replay (idempotent — replaying a synced batch does not re-text).
- **Collector is notified on accept/decline, opt-in only**, via the separate `collector_contact` table (`DB.md` §3.1a) — never the base `collector` table, which stays at four columns.
- **Fail-open, exactly like `callDetect`/`callPredict`:** `sendSms()` never throws and is never awaited on a request path. A Fast2SMS outage must never block an acceptance or a handover.
- **Default OFF** (`SMS_ENABLED`), plus an `SMS_ALLOWLIST` and an `SMS_DRY_RUN` mode — because the 155+ seeded recycler numbers are real businesses on a public government register, and an accidental broadcast is a real-world harm, not a test failure.
- No message ever carries a collector's identity, per the no-personal-data ground rule.

---

## 7. Seed data

| Dataset | Source | Notes |
|---|---|---|
| Recyclers | `mpcb_recyclers.csv` — MPCB published list, 161 rows | Filter `status = VALID` → **74** rows. Geocode each address once and ship lat/lng in the app |
| Rates | Field visit + recycler phone calls | Every row labelled `FIELD_COLLECTED` with location and date |
| Market range | Published scrap aggregator sites | Labelled `MARKET_INDICATIVE`. Never shown to a collector as the price |
| Categories | The seven named in the brief, plus sub-categories | With `critical_minerals` and expected weight ranges |

Seed **both** your field district and your college district so the app genuinely works in the demo room.

**Refreshing the MPCB list:** `npm run mpcb:refresh [path-to-csv]` (`server/api/scripts/mpcb-refresh.js`) re-parses a dropped-in CSV and updates `authorization_status`/`validity_to` on existing recycler rows — it never creates or deletes one, and it never scrapes the government site live (MPCB publishes this as a PDF, not an API). It **refuses to run** if `fetchedOn` in `mpcbSource.js` was not also updated in the same change: a stale `fetchedOn` is a claim ("we checked on this date"), not an omission, and an unchanged one is exactly as untrustworthy as no date at all.

Loading the recycler CSV is one statement — no import script needed:

```sql
CREATE TEMP TABLE mpcb_raw (
  sr int, name_address text, type text, capacity_mta text,
  registration text, validity text, status text, email text, phone text
);

\copy mpcb_raw FROM 'mpcb_recyclers.csv' WITH (FORMAT csv, HEADER true);

INSERT INTO recycler (id, name, address, type, capacity_mta, registration_no,
                      validity_to, authorization_status, email, phone)
SELECT gen_random_uuid(), split_part(name_address, ',', 1), name_address,
       NULLIF(type,''), NULLIF(capacity_mta,'')::int, registration,
       NULLIF(validity,'')::date, status, NULLIF(email,''), NULLIF(phone,'')
FROM mpcb_raw
ON CONFLICT (registration_no) DO NOTHING;
```

`lat` / `lng` are filled in afterwards from the geocoding pass and are the only manual step.

---

## 8. Deployment

Single VM or a free-tier container host. Postgres managed or on the same box. HTTPS via a reverse proxy with automatic certificates.

Ship a `docker-compose.yml` and a README a stranger can run in two commands — the repo being reproducible is cheap and is part of Technical Execution.

```bash
docker compose up -d db
npx prisma migrate deploy      # or: psql -f schema.sql
npm run seed                   # idempotent, re-runnable from the CSV
npm run dev
```

The seed script must be idempotent — `ON CONFLICT DO NOTHING` throughout — because you will re-run it a dozen times on Day 1 as field rates come in.

---

## 9. Build order

1. Schema + migrations
2. `GET /sync/bootstrap` returning seeded categories, recyclers, rates
3. `POST /sync/push` with idempotent upsert — **the highest-risk piece, build it early**
4. Console: publish rates → appears in bootstrap
5. Console: lookup by reference, submit handover
6. `POST /handover/{id}/confirm` — collector's confirmation, closing the record
7. `GET /sync/delta`
8. Photo upload
9. Anomaly detectors (see `AI.md`) — **built and wired in**: they run automatically, fail-open and un-awaited, after every confirmed handover, plus on demand from an operator button on the console's flags page
10. Fast2SMS notifications (see §6.1) — recycler alerted on acceptance (online and offline-outbox paths), collector alerted on accept/decline if they opted in

If the schedule slips, cut in reverse order. **Do not cut 3 or 6** — they are the offline claim and the two-sided signature, which are the two things being demonstrated.

---

## 10. The queries that matter

> **These are the original design, not the shipped implementation of the detectors.** `current_rate` and the idempotent-push pattern below are real and in use. The two detector queries (D2, D7) were the design before `server/aiml` existed as a separate service — the shipped D2 and D7 are Python functions there, computing the same logic over a JSON payload rather than a live query. Left here because the SQL is the clearest way to understand *what* each detector computes, even though it is not literally what runs.

Four pieces of SQL carry most of the system. Written out here so nobody reinvents them at 2 a.m.

### Latest published rate per recycler per category

Rates are append-only, so "current rate" is always a query, never a column.

```sql
SELECT DISTINCT ON (recycler_id, category_id)
       recycler_id, category_id, unit, price, created_at
FROM rate
ORDER BY recycler_id, category_id, created_at DESC;
```

`DISTINCT ON` is Postgres-specific and exactly right here. Wrap it in a view called `current_rate` and use that view everywhere — including in `/sync/bootstrap`.

### Idempotent push

```sql
INSERT INTO lot (id, collector_id, category_id, unit, quantity, estimated_value,
                 collection_lat, collection_lng, collection_ts, status, device_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (id) DO NOTHING
RETURNING id;
```

`DO NOTHING`, not `DO UPDATE` — a lot the device already sent is a fact, and replaying the outbox must never rewrite history. `handover` uses the same pattern, which is what makes the whole sync safe to retry.

### Detector D2 — systematic underpayment

The single most valuable detector, and it is one query:

```sql
SELECT h.recycler_id,
       count(*) AS n,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY h.final_unit_price / NULLIF(a.accepted_rate, 0)
       ) AS median_ratio
FROM handover h
JOIN acceptance a ON a.lot_id = h.lot_id
WHERE h.collector_confirmed_at IS NOT NULL
GROUP BY h.recycler_id
HAVING count(*) >= 10                       -- D2 min-data precondition
   AND percentile_cont(0.5) WITHIN GROUP (
         ORDER BY h.final_unit_price / NULLIF(a.accepted_rate, 0)
       ) < 0.85;                            -- D2 threshold
```

Note the `HAVING count(*) >= 10` — the minimum-data precondition from `AI.md` is enforced *in the query*, so the detector physically cannot fire on data too thin to support it.

### Detector D7 — impossible travel

```sql
SELECT h.id, h.lot_id,
       earth_distance(
         ll_to_earth(l.collection_lat, l.collection_lng),
         ll_to_earth(h.handover_lat,  h.handover_lng)
       ) / 1000.0
       / GREATEST(EXTRACT(EPOCH FROM (h.handover_ts - l.collection_ts)) / 3600.0, 0.01)
       AS implied_kmph
FROM handover h JOIN lot l ON l.id = h.lot_id
WHERE ... > 80;
```

Needs `CREATE EXTENSION cube; CREATE EXTENSION earthdistance;` — both ship with Postgres. If you would rather not add extensions, compute haversine in JavaScript; it is ten lines and the volumes here are trivial.

**Every detector writes to `anomaly_flag` with its triggering numbers in `detail`**, so each flag is explainable in one sentence on the console.
