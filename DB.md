# Database Schema — SIH26229

**Authoritative.** Where this document and any other disagree, this one wins.
**Companion documents:** `FLOW.md`, `FRONTEND.md`, `SERVER.md`, `AI.md`

Nine tables on the server. One more on the device. Nothing speculative — every column exists because something in the flow reads or writes it.

---

## 1. The decisions that cannot be undone

Read this section before writing any DDL. Everything else in this file is easy to change in week two; these seven are not.

| # | Decision | Why it is irreversible |
|---|---|---|
| 1 | **UUIDs generated on the device**, not serial IDs | The whole offline model depends on a record having an identity before it ever reaches a server. Switching later means rewriting sync and re-keying every row |
| 2 | **`rate` is append-only** — a change is a new row, never an `UPDATE` | Overwrite a rate once and that history is gone permanently. Price trends, bait-price detection and "what was the rate when they accepted" all become impossible |
| 3 | **`accepted_rate` is frozen on `acceptance`** | If you look the rate up later instead of snapshotting it, you can never reconstruct what the collector was promised. The three-price model collapses |
| 4 | **`unit` is stored on every quantity and every price** | Assume kilograms now and add pieces later, and every historical row becomes ambiguous with no way to tell which is which |
| 5 | **Money is `numeric`, never `float`** | Floating-point rounding errors cannot be repaired retroactively |
| 6 | **All timestamps are `timestamptz`** | A naive timestamp has lost information that cannot be recovered |
| 7 | **No personal data columns exist at all** | A nullable `name` column will get filled in. The safest way not to hold personal data is for there to be nowhere to put it |

---

## 2. Conventions

- Primary keys are `uuid`. Rows created **on a device** carry a device-generated UUIDv7. Rows created **on the server** (`recycler`, `category`, `rate`) use `gen_random_uuid()`.
- Money: `numeric(12,2)`. Quantity: `numeric(10,3)` — three decimals covers grams.
- Coordinates: `double precision`, nullable, because GPS can genuinely be unavailable.
- Controlled vocabularies are `text` with a `CHECK`, **not** Postgres `enum` — enums are painful to extend and these will grow.
- Every table has `created_at timestamptz NOT NULL DEFAULT now()`.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
```

---

## 3. The tables

### 3.1 `collector` — *Collector Dataset*

```sql
CREATE TABLE collector (
  id                 uuid PRIMARY KEY,              -- device-generated
  preferred_language text NOT NULL CHECK (preferred_language IN ('mr','hi')),
  operating_area     text,                          -- ward or locality. Coarse, never an address
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

**Four columns, and that is the point.** No name, no Aadhaar, no phone, no photograph of a person. The brief says avoid unnecessary personal information; this table is the evidence that we did, and it is the answer to any DPDP question.

### 3.2 `recycler` — *Recycler Dataset*

```sql
CREATE TABLE recycler (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  address              text NOT NULL,
  lat                  double precision,
  lng                  double precision,
  type                 text NOT NULL CHECK (type IN ('RECYCLER','DISMANTLER')),
  capacity_mta         integer,
  registration_no      text UNIQUE NOT NULL,
  validity_to          date,
  authorization_status text NOT NULL CHECK (authorization_status IN ('VALID','LAPSED_IN_LIST')),
  phone                text,
  email                text,
  service_area_km      integer NOT NULL DEFAULT 25,
  pickup_available     boolean NOT NULL DEFAULT false,
  materials_accepted   text[] NOT NULL DEFAULT '{}',   -- category codes
  created_at           timestamptz NOT NULL DEFAULT now()
);
```

Seeded from `mpcb_recyclers.csv` — 161 rows, of which **74** are `VALID`. **The API only ever returns `VALID`.**

> `LAPSED_IN_LIST` means *the published record* shows an expired date. It does **not** mean the facility is operating unlawfully — many will have renewed without MPCB republishing. Never present it as the latter, in the app or on a slide.

### 3.3 `category` — *Material Dataset*

```sql
CREATE TABLE category (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text UNIQUE NOT NULL,       -- CABLE, PCB, PANEL, CRT, BATTERY, MOTOR, PLASTIC, OTHER
  parent_id           uuid REFERENCES category(id),
  name_en             text NOT NULL,
  name_mr             text NOT NULL,
  name_hi             text NOT NULL,
  icon_key            text NOT NULL,
  default_unit        text NOT NULL CHECK (default_unit IN ('KG','PIECE')),
  critical_minerals   text[] NOT NULL DEFAULT '{}',
  expected_qty_min    numeric(10,3),              -- p5,  from field data. Feeds detector D4
  expected_qty_max    numeric(10,3),              -- p95, from field data. Feeds detector D4
  created_at          timestamptz NOT NULL DEFAULT now()
);
```

`parent_id` gives sub-categories for free — computer board vs appliance board, phone battery vs inverter battery — without a second table.

`critical_minerals` is not decoration. Lithium, cobalt, neodymium, tantalum, gallium, indium are why the **Ministry of Mines** commissioned this statement, and this column is what lets the pitch say so with data behind it.

`expected_qty_min/max` start `NULL` and are populated from real field data. Detector D4 must not run until they are set.

### 3.4 `rate` — *Price Dataset*

```sql
CREATE TABLE rate (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recycler_id  uuid NOT NULL REFERENCES recycler(id),
  category_id  uuid NOT NULL REFERENCES category(id),
  unit         text NOT NULL CHECK (unit IN ('KG','PIECE')),
  price        numeric(12,2) NOT NULL CHECK (price >= 0),
  source       text NOT NULL CHECK (source IN ('RECYCLER_PUBLISHED','FIELD_COLLECTED','MARKET_INDICATIVE')),
  location     text,
  valid_from   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

**Append-only. There is no `UPDATE` on this table, ever.** Publishing a new rate inserts a row. The accumulated history *is* the price dataset the brief asks for.

`source` must be honest on every row. A rate you collected in the field is `FIELD_COLLECTED` with its location and date; a rate scraped from a commercial site is `MARKET_INDICATIVE` and is **never shown to a collector as the price**.

"Current rate" is therefore always a query, never a column:

```sql
CREATE VIEW current_rate AS
SELECT DISTINCT ON (recycler_id, category_id)
       recycler_id, category_id, unit, price, valid_from
FROM rate
WHERE source = 'RECYCLER_PUBLISHED'
ORDER BY recycler_id, category_id, valid_from DESC;
```

Use this view everywhere, including `/sync/bootstrap`.

### 3.5 `lot` — *Material + Transaction Dataset*

```sql
CREATE TABLE lot (
  id                 uuid PRIMARY KEY,                -- device-generated
  collector_id       uuid NOT NULL REFERENCES collector(id),
  category_id        uuid NOT NULL REFERENCES category(id),
  unit               text NOT NULL CHECK (unit IN ('KG','PIECE')),
  quantity           numeric(10,3) NOT NULL CHECK (quantity > 0),
  condition          text NOT NULL CHECK (condition IN ('GOOD','FAIR','POOR')),
  source_type        text CHECK (source_type IN ('HOUSEHOLD','SHOP','OFFICE','INSTITUTIONAL','STREET','OTHER')),
  estimated_value    numeric(12,2) NOT NULL CHECK (estimated_value >= 0),
  collection_lat     double precision,
  collection_lng     double precision,
  collection_ts      timestamptz NOT NULL,
  status             text NOT NULL CHECK (status IN ('DRAFT','ACCEPTED','HANDED_OVER','CANCELLED')),
  device_id          text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

`category_id` points at the **leaf** category — the sub-category when one was chosen, the parent otherwise. One column, no ambiguity.

`collection_ts` is the **first** of the two timestamps. It comes from the device, not the server, because the lot may be created days before it syncs.

**`condition` and `source_type` are both named in the brief's Material Dataset** — *"material category, sub-category, material description, image, approximate weight, condition, source type, and estimated value."* They belong on `lot` and they belong here now, because §1 rule 4 applies: a condition column added later leaves every historical row unclassifiable.

- **`condition` is `NOT NULL`.** Three values, one tap, no "unknown" — an unrecorded condition makes the value density detector (D5) meaningless. It affects the estimate through a documented multiplier held in `condition_factor` (below), and it appears on the handover record so both parties saw the same declaration.
- **`source_type` is nullable** and skippable in the UI. It is analytical rather than transactional — useful for showing where material actually originates, worthless if it slows the collector down.

```sql
CREATE TABLE condition_factor (
  condition text PRIMARY KEY CHECK (condition IN ('GOOD','FAIR','POOR')),
  factor    numeric(4,3) NOT NULL CHECK (factor > 0 AND factor <= 1)
);
INSERT INTO condition_factor VALUES ('GOOD',1.000),('FAIR',0.850),('POOR',0.700);
```

A table rather than hard-coded constants, because these are **assumptions, not measurements**, and the first field visit will change them. Say exactly that if a judge asks where 0.85 came from: *"a stated default we will replace with observed data."* Never present it as empirical.

### 3.6 `acceptance`

```sql
CREATE TABLE acceptance (
  id                uuid PRIMARY KEY,                -- device-generated
  lot_id            uuid NOT NULL REFERENCES lot(id),
  recycler_id       uuid NOT NULL REFERENCES recycler(id),
  accepted_rate     numeric(12,2) NOT NULL,          -- FROZEN. Never recomputed
  accepted_unit     text NOT NULL CHECK (accepted_unit IN ('KG','PIECE')),
  accepted_ts       timestamptz NOT NULL,
  recycler_response text NOT NULL DEFAULT 'NONE'
                    CHECK (recycler_response IN ('NONE','ACKNOWLEDGED','DECLINED')),
  response_ts       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

**Why this is its own table and not four columns on `lot`.** A recycler can decline, and the collector then accepts a different one. As columns on `lot` the first acceptance would be overwritten and the decline would vanish.

That record is worth keeping for two reasons: the collector's journey is real history, and **a recycler who publishes an attractive rate and then declines everything is a gaming pattern** — one you can only detect if declines are stored.

`accepted_rate` is the **second of the three prices** and is frozen here permanently.

### 3.7 `handover` — *Traceability Dataset*

```sql
CREATE TABLE handover (
  id                     uuid PRIMARY KEY,          -- device- or console-generated
  lot_id                 uuid NOT NULL UNIQUE REFERENCES lot(id),
  recycler_id            uuid NOT NULL REFERENCES recycler(id),
  reference_code         text UNIQUE NOT NULL,      -- short, human-readable, on the QR
  inspected_quantity     numeric(10,3) NOT NULL CHECK (inspected_quantity > 0),
  final_unit_price       numeric(12,2) NOT NULL CHECK (final_unit_price >= 0),
  final_total            numeric(12,2) NOT NULL CHECK (final_total >= 0),
  handover_lat           double precision,
  handover_lng           double precision,
  handover_ts            timestamptz NOT NULL,
  status                 text NOT NULL DEFAULT 'PENDING_COLLECTOR'
                         CHECK (status IN ('PENDING_COLLECTOR','CONFIRMED','DISPUTED')),
  recycler_confirmed_at  timestamptz,
  collector_confirmed_at timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT handover_confirmed_needs_both_signatures CHECK (
    status <> 'CONFIRMED'
    OR (recycler_confirmed_at IS NOT NULL AND collector_confirmed_at IS NOT NULL)
  )
);
```

**This constraint is the project's headline integrity claim** — a handover cannot reach `CONFIRMED` without both parties' signatures, and the database enforces it rather than a route handler that holds only as long as someone remembers it.

> **Correction to an earlier draft in `SERVER.md`.** The first version required both timestamps to be null or both set. That would have blocked your actual flow, where the recycler submits first and the collector confirms a moment later. The constraint above permits that intermediate state and still guarantees a `CONFIRMED` record carries both signatures. Use this version.

`lot_id` is `UNIQUE` — one lot, one handover.

`reference_code` is generated **on the device** (Base32 of the first 5 bytes of the lot UUID, 8 characters) so it exists offline. Collision probability at any realistic volume is negligible, and the `UNIQUE` constraint catches it if it ever happens.

`handover_ts` is the **second** timestamp; `handover_lat/lng` the second geotag. Together with the collection pair they make detector D7 possible.

**Never `UPDATE` a confirmed handover.** A correction is a new row referencing the original — this is an event log, not mutable state, which is why sync conflicts cannot occur.

### 3.8 `photo`

```sql
CREATE TABLE photo (
  id          uuid PRIMARY KEY,                      -- device-generated
  lot_id      uuid NOT NULL REFERENCES lot(id),
  kind        text NOT NULL CHECK (kind IN ('LOT','HANDOVER')),
  sha256      text NOT NULL,
  bytes       integer NOT NULL,
  uploaded_at timestamptz,                           -- NULL until the file arrives
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

`sha256` gives integrity and free duplicate detection — the same photograph reused across two lots is a fabrication signal.

`uploaded_at` being `NULL` is normal, not an error: **a record is valid before its photograph has synced.**

### 3.9 `anomaly_flag`

```sql
CREATE TABLE anomaly_flag (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type  text NOT NULL CHECK (subject_type IN ('LOT','HANDOVER','RECYCLER','COLLECTOR')),
  subject_id    uuid NOT NULL,
  detector_code text NOT NULL,                       -- D1..D8, see AI.md
  severity      text NOT NULL CHECK (severity IN ('INFO','WARN','CRITICAL')),
  detail        jsonb NOT NULL,                      -- the numbers that triggered it
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
```

`subject_id` is deliberately **not** a foreign key — it points at four different tables. This is the one place where a little looseness is worth it; the alternative is four near-identical tables.

`detail` must always contain the triggering numbers, so every flag is explainable in one sentence on the console.

### 3.10 `outbox` — **device only, never on the server**

```sql
CREATE TABLE outbox (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,      -- lot | acceptance | handover | photo
  entity_id   TEXT NOT NULL,
  payload     TEXT NOT NULL,      -- json
  created_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  synced_at   TEXT                -- NULL until the server acknowledges
);
```

Lives in SQLite on the phone. Sync pushes every row where `synced_at IS NULL`; the server upserts by UUID with `ON CONFLICT (id) DO NOTHING`, so **replaying the batch is harmless**.

---

## 4. Indexes

Only what is actually queried. Add more when something is slow, not before.

```sql
CREATE INDEX rate_lookup        ON rate (recycler_id, category_id, valid_from DESC);
CREATE INDEX lot_by_collector   ON lot (collector_id, created_at DESC);
CREATE INDEX acceptance_by_lot  ON acceptance (lot_id);
CREATE INDEX acceptance_by_recy ON acceptance (recycler_id, accepted_ts DESC);
CREATE INDEX handover_by_recy   ON handover (recycler_id, handover_ts DESC);
CREATE INDEX photo_by_lot       ON photo (lot_id);
CREATE INDEX flag_by_subject    ON anomaly_flag (subject_type, subject_id);
CREATE INDEX recycler_valid     ON recycler (authorization_status) WHERE authorization_status = 'VALID';
```

---

## 5. How this satisfies the brief's six datasets

| Brief's dataset | Tables |
|---|---|
| Material Dataset | `category` + `lot` + `photo` |
| Price Dataset | `rate` (append-only history) |
| Recycler Dataset | `recycler` |
| Transaction Dataset | `lot` + `acceptance` + `handover` |
| Traceability Dataset | `handover` + `photo` (two geotags, two timestamps, reference code, both confirmations) |
| Collector Dataset | `collector` (minimal by design) |

The **three prices** the flow depends on live in three different tables, which is what keeps them independently auditable:

| Price | Where |
|---|---|
| What the collector was shown | `lot.estimated_value` |
| What the recycler had published | `acceptance.accepted_rate` *(frozen)* |
| What was actually paid | `handover.final_total` *(both-confirmed)* |

---

## 6. Deliberately not included

`payment`, `pickup_request`, `message`, `rating`, `notification`, `user`/`password` for collectors, `session`, `audit_log`, brand or model columns, any device-level taxonomy.

Each is easy to add in week two without touching an existing column. **Nothing in section 1 is.** That is the whole basis on which this schema was cut.
