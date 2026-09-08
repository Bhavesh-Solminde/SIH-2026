# Plan — Critical Mineral Ledger (the environmental feature)

**Date:** 2026-09-07 · **Deadline:** idea submission 20 September 2026 (13 days)
**Decision record:** `ENVIRONMENTAL-FEATURES.md` — this plan implements its recommendation
**Originating task:** `docs/superpowers/plans/2026-09-06-repair-sms-and-evidence.md` Task 11
**Scope:** build the Critical Mineral Ledger. **D14 / perceptual hash stays held** — see §7.

---

## 1. What we are building, in one sentence

> Turn **counter-signed, confirmed** handovers into a per-mineral, per-district, per-month
> recovery figure, where every coefficient carries a published citation rendered in the UI
> and every number is labelled `ESTIMATED`.

No change to the collector app. No change to the loop. The ledger *reads* what the product
already produces.

---

## 2. The benefit — what this actually buys us

Full argument in `ENVIRONMENTAL-FEATURES.md`. The short version, four things:

1. **It answers the sponsor's rubric in the sponsor's vocabulary.** The statement is
   commissioned by the **Ministry of Mines / JNARDDC**, not a waste ministry. Every other
   team pitches *kilograms of waste diverted*. We pitch *grams of cobalt, neodymium,
   tantalum recovered, by district, by month*. Same rows in the database; one of the two
   framings is aimed at the people in the room.

2. **The defensibility is the differentiator, not the number.** Anyone can multiply tonnage
   by a coefficient — a spreadsheet does that. Bhaav is the only system in the room where
   every input row is a **two-party counter-signed handover**, which is why we can throw
   away every unconfirmed record and still have a ledger. The repeatable sentence is not
   "we count minerals", it is:

   > *"Our number cannot be inflated, because a row only enters it after both the collector
   > and an MPCB-authorised recycler have signed it."*

   That is the sentence a judge repeats to a colleague an hour later. That is the test.

3. **It reframes the product for free.** From *a price-transparency app for scrap collectors*
   to *field-level instrumentation for urban mining that pays the collector to produce the
   data*. Zero new user actions, zero new demo risk.

4. **It cashes in a column we already ship.** `Category.criticalMinerals` is seeded across 16
   categories today and currently proves nothing.

**Rubric read (10 marks each):** highest available gain on *Social & environmental impact*;
high on *Innovation* (the mechanism is novel, the metric is not); high on *Feasibility* (it
reads a loop that already works); high on *Presentation* (one sentence). Low-moderate on
*Technical execution* — the query is simple, and that is fine, we score that rubric already
with eleven detectors.

**Cost of not building it:** the pitch keeps a Ministry-of-Mines-shaped hole in it, and the
impact rubric gets answered with collector earnings and diverted kilograms — real, but the
same answer thirty other teams give, in the wrong ministry's vocabulary.

---

## 3. The blocking dependency — read this before writing any code

> **The engineering is ~8 hours. The real work is sourcing ~10 coefficients from citable
> published sources. DO NOT INVENT A SINGLE NUMBER.**

A JNARDDC judge knows these figures the way we know our own schema. One fabricated
coefficient destroys the credibility of every other number in the pitch — including the
honest Vasai field rates, which are our single best piece of evidence.

- **Owner:** one person with a browser, starting **today**, before any schema is written.
- **Deliverable:** a table of `(categoryCode, mineral, unit, gramsPerUnit, sourceCitation,
  sourceYear, url)` rows, each traceable to a published document.
- **Candidate sources to check** (verify each; none of these is pre-approved):
  Global E-waste Monitor (UNITAR/ITU); StEP Initiative material-composition reports;
  **Indian Bureau of Mines and JNARDDC's own publications** — the sponsor's material, worth
  more than anything else in this list; CPCB e-waste management guidelines; National
  Critical Mineral Mission documents; peer-reviewed composition studies in *Waste
  Management* / *Resources, Conservation and Recycling*.
- **If a coefficient cannot be sourced: omit that mineral and say so out loud.** A ledger
  covering six cited minerals beats one covering fifteen where nine are guessed.
- **ABORT LINE — decide it now, not at hour thirty:** fewer than **three** cited minerals
  covering at least **two** categories → drop the feature. Sunk cost is the sourcing hours
  and nothing else, because no schema depends on it yet.

---

## 4. The correctness trap the earlier spec missed: units

The Task 11 schema sketch says `gramsPerKg`. **That is wrong for this domain and would ship a
silently incorrect ledger.**

`Lot.unit` (`schema.prisma`) is `KG` **or** `PIECE`, and four seeded categories are
`PIECE`-denominated: `PANEL`, `PANEL_LAPTOP`, `PANEL_TV`, `CRT`. `Handover.inspectedQuantity`
is a bare `Decimal` with **no unit column of its own** — the authoritative unit for that
number is `Lot.unit`. Multiplying a count of CRT monitors by a grams-per-kilogram figure
produces a number that is not wrong by a percentage, it is wrong by a dimension.

Two consequences, both binding:

1. The coefficient carries its **own unit**, and `unit` is part of the primary key:
   `gramsPerUnit` + `unit ∈ {KG, PIECE}`, not `gramsPerKg`.
2. The aggregation **joins through to `Lot.unit` and matches on it**. A confirmed handover
   whose `lot.unit` has no coefficient row at that unit is **excluded and counted as
   uncovered** — never silently coerced.

Same discipline for two smaller ones:

- **`Recycler.district` is nullable** (`seed.js:95` writes `row.district || null`). Group
  NULL into an explicit `"UNSPECIFIED"` bucket; do not let it vanish.
- **Month bucketing must pin a timezone.** `handoverTs` is `timestamptz`; bucket in
  `Asia/Kolkata` explicitly, or a late-evening handover lands in the wrong month.

---

## 5. Schema

```prisma
// The provenance lives beside the value, not in a footnote: every derived
// figure in the ledger is traceable to a published source without leaving
// the database. gramsPerUnit is per ONE unit of `unit` — see plan §4; the
// domain is mixed KG/PIECE and a grams-per-kg-only table is dimensionally
// unsound.
model MineralCoefficient {
  categoryCode   String   @map("category_code")
  mineral        String
  unit           String   // 'KG' | 'PIECE' — must match Lot.unit to be applied
  gramsPerUnit   Decimal  @map("grams_per_unit") @db.Decimal(12, 4)
  sourceCitation String   @map("source_citation")
  sourceUrl      String?  @map("source_url")
  sourceYear     Int      @map("source_year")
  note           String?
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@id([categoryCode, mineral, unit])
  @@map("mineral_coefficient")
}
```

Keyed on `categoryCode` (the stable business key), **not** a `Category` FK — the coefficient
table is reference data seeded from citations, and keeping it decoupled means a coefficient
row for a category we have not seeded yet is inert rather than a constraint violation.

Migration: `server/api/prisma/migrations/20260907HHMMSS_add_mineral_coefficient/`.

---

## 6. Tasks

### Task 1 — Source the coefficients *(blocking, human, 4–8 h, start first)*

- [ ] Fill `server/api/seed/mineralCoefficients.js` with **only** rows that have a real
      citation, year and URL.
- [ ] Write a short report in the file header: which minerals were sourced and from where;
      which could **not** be sourced, named explicitly.
- [ ] Check the abort line (§3) before proceeding to Task 2.

### Task 2 — Schema + migration *(~1 h)*

- [ ] Add the model above to `server/api/prisma/schema.prisma`.
- [ ] `npx prisma migrate dev --name add_mineral_coefficient`.
- [ ] Commit schema + migration alone.

### Task 3 — Seed *(~0.5 h)*

- [ ] `server/api/seed/mineralCoefficients.js` exports `COEFFICIENTS`.
- [ ] `seedMineralCoefficients(prisma)` in `seed/seed.js`, wired into `seedAll` — **idempotent
      upsert**, matching `seedCategories`/`seedConditionFactors` conventions.
- [ ] Extend `server/api/test/seed.test.js`: re-running the seed does not duplicate rows, and
      **every seeded row has a non-empty `sourceCitation` and a `sourceYear`**. A coefficient
      without provenance must fail the suite.

### Task 4 — Aggregation + endpoint *(~2.5 h, tests first)*

`GET /admin/minerals?from=&to=&district=&mineral=` — mounted on the existing `adminRouter`
(`requireSession` + `requireAdmin` already applied at the router). Admin-only and
cross-tenant by design: district totals span every recycler, which is exactly what a
recycler must not see.

Aggregation, over `handover.status = 'CONFIRMED'` only:

```
handover ⋈ lot (handover.lot_id) ⋈ category (lot.category_id) ⋈ recycler (handover.recycler_id)
       ⋈ mineral_coefficient ON (category.code, lot.unit)

grams = Σ ( handover.inspected_quantity × coefficient.grams_per_unit )   -- numeric, not float
GROUP BY mineral,
         date_trunc('month', handover.handover_ts AT TIME ZONE 'Asia/Kolkata'),
         COALESCE(recycler.district, 'UNSPECIFIED')
```

Response shape:

```json
{
  "basis": "CONFIRMED handovers only — both parties counter-signed",
  "label": "ESTIMATED",
  "rows": [{ "mineral": "...", "month": "2026-09", "district": "...",
             "grams": "...", "handovers": 12,
             "sources": [{ "citation": "...", "year": 2024, "url": "..." }] }],
  "coverage": { "confirmed_handovers": 0, "covered_handovers": 0,
                "uncovered_handovers": 0, "uncovered_categories": [] }
}
```

- [ ] Write `server/api/test/admin-minerals.test.js` **first**. Required assertions:
  - a `PENDING_*` / `DISPUTED` handover contributes **zero** grams;
  - grouping splits correctly across two districts and two months;
  - **every returned row carries at least one non-empty citation** (this is the honesty
    guard, and it belongs in the suite, not in a review checklist);
  - a `PIECE` lot is **not** multiplied by a `KG` coefficient — it lands in
    `coverage.uncovered_*`;
  - a NULL-district recycler appears under `"UNSPECIFIED"`, not dropped;
  - a handover whose category has no coefficient increments `uncovered_handovers`;
  - non-admin session → 403 (mirror `admin-flags.test.js`).
- [ ] Implement in `server/api/src/lib/mineralLedger.js` + a route block in
      `src/routes/admin.js`. Keep the arithmetic in SQL `numeric` / Prisma `Decimal` — no
      float, no JS `Number` in the sum path.
- [ ] Per the repo's testing conventions, this suite shares the backend: it runs serially
      with the rest and cleans up after itself (`test/helpers/db.js`).

### Task 5 — Console screen *(~3 h, tests first)*

`client/console/src/app/(protected)/admin/minerals/page.jsx` + a Nav entry, matching
`admin/queue` and `admin/recyclers`.

- [ ] `client/console/test/admin-minerals.test.jsx` first. Required assertions:
  - the word **ESTIMATED** is rendered next to every figure — not once in a page footer;
  - **the citation and year are visible in the UI** for each mineral, not hidden behind a
    tooltip and not only in the deck;
  - the coverage line renders — *"this ledger accounts for N of M confirmed handovers"*;
  - the basis line renders — *"confirmed, counter-signed handovers only"*.
- [ ] Implement: filters (month range, district, mineral), a table, and a citations block.
      Presentation last, per the repo's stated priority.

### Task 6 — Docs + demo *(~1 h)*

- [ ] `ENVIRONMENTAL-FEATURES.md` — flip the status from HELD to built; record which minerals
      were sourced and which were dropped.
- [ ] `README.md`, `DB.md` (§3.x for the new table), `SERVER.md` (API surface).
- [ ] Add the ledger beat to the demo script, and add the two Q&A answers from §8 to the
      question bank.
- [ ] Commit as `feat(ledger): critical mineral recovery ledger over confirmed handovers`.

---

## 7. Deliberately NOT built

- **D14 / perceptual-hash photo-reuse detection.** 6–10 h, most of it threshold tuning, and it
  earns marks under *Technical execution* — the one rubric eleven working detectors already
  answer. A twelfth detector is invisible to a judge. If evidence integrity comes up, the
  truthful verbal answer is stronger than a rushed detector: photos are captured in-flow with
  GPS and timestamp bound to the transaction (`Handover.handoverLat/Lng/Ts`), each is stored
  with a `sha256`, byte-identical reuse across lots is a single `GROUP BY sha256 HAVING
  count(*) > 1`, and perceptual near-duplicate detection is specified in
  `AI-ANOMALY-SPEC.md` §6.3 and deliberately deferred.
- **A national extrapolation.** Report what the seeded and demo handovers actually contain.
  A national figure from a demo dataset is the precise claim a Ministry judge takes apart.
- **A collector-app mineral screen.** No user need, new demo surface area, zero rubric gain.

---

## 8. Demo moment and the two questions that will come

**The demo beat (≈20 s, at the end of the existing loop):** complete the counter-signed
handover on the phone → open the console ledger → the row for that mineral moves. One
sentence over it: *"that gram figure only moved because two parties signed."*

- *"Where do these coefficients come from?"* → name the source and year on screen; state
  plainly which minerals we could **not** source and therefore did not include.
- *"Isn't this just an estimate?"* → yes, and it is labelled `ESTIMATED` in the UI. The
  estimated part is the composition coefficient. The **measured** part is the mass, and it is
  measured at the point of transfer by two parties who disagree about price — which is why
  neither can inflate it.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Sourcing stalls | Abort line in §3, decided before the work starts |
| `ESTIMATED` drifts off the UI into deck-only | Asserted in the console test suite (Task 5) |
| Unit coercion ships a dimensionally wrong number | Asserted in the API test suite (Task 4) |
| Scope creep to a national figure | §7 — report only what the dataset contains |
| Ledger eats demo minutes | One 20-second beat at the end of the existing loop; no new screens in the app |

---

## NOTES FOR BHAVESH

- **Concept:** an impact metric is only as strong as the *provenance of the rows it
  aggregates*. Two-party confirmation is what turns a multiplication into evidence.
- **Decision:** aggregate over `status = 'CONFIRMED'` only, and exclude rather than coerce
  unit-mismatched rows. Both trades buy a smaller headline number and a defensible one.
- **Pattern:** a **coefficient table with per-row citation and source year** — provenance
  stored beside the value. Same shape as a bibliography table; every derived figure stays
  traceable without leaving the database.
- **Common mistake:** naming a coefficient column after one unit (`gramsPerKg`) in a
  mixed-unit domain. The unit belongs *in the key*, and the aggregation must match it against
  the authoritative unit column — otherwise the join silently produces dimensionally
  meaningless sums that no test catches unless you write that test on purpose.
