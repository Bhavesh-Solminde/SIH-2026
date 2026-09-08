# Plan — Traceability Ledger & Transaction Report

**Date:** 2026-09-07 · **Deadline:** idea submission 20 September 2026 (13 days)
**Scope:** an append-only, tamper-evident event ledger for every lot, plus a per-transaction
PDF report generated from it.
**Depends on:** nothing. Reads and instruments the loop that already works.
**Related:** `docs/superpowers/plans/2026-09-07-critical-mineral-ledger.md` (the report embeds
its output), `docs/superpowers/plans/2026-09-06-repair-sms-and-evidence.md` (built the two
evidence captures this plan formalises).

---

## 1. What we are building, in one sentence

> Every lot carries an **append-only, hash-chained ledger** of the seven steps it passes
> through — each row with a timestamp, a status, and the party who confirmed it, and the
> first and last physical steps carrying a geotag and a photograph — and at the end of the
> chain, a **one-page PDF report** that any judge, auditor or bank clerk can hold, verify,
> and re-verify against the database.

---

## 2. What already exists (do not rebuild it)

The flow you described is **already 80% implemented**. Read this table before writing a line
of code — most of this feature is *recording* what the system already does, not adding steps.

| Your step | Already in the code | Where |
|---|---|---|
| Collector creates lot | `Lot` row, `status = DRAFT` | `routes/public.js:165` `POST /public/lots`, `routes/sync.js` |
| Geo + photo → Lot Ready | `lot.collectionLat/Lng/collectionTs` + `Photo{kind:'LOT'}` | `CameraScreen.jsx`, `routes/photos.js` |
| Recycler accepts | `Acceptance.recyclerResponse='ACKNOWLEDGED'` + `responseTs`, lot → `ACCEPTED` | `routes/recycler.js:193` |
| Handover started | lot → `IN_TRANSIT` | `routes/lots.js:121` `POST /lots/:id/depart` |
| Geo + photo ← arrived | `handover.handoverLat/Lng` + `Photo{kind:'HANDOVER'}`, **both server-enforced** | `HandoverEvidenceScreen.jsx`, `routes/handover.js` confirm |
| Recycler confirms receipt | ⚠️ **partially** — `recyclerConfirmedAt` is stamped at *proposal* time, not receipt | `routes/handover.js` POST `/` |
| Final report | ❌ **does not exist** | — |

### The four real gaps

1. **No event ledger.** The facts are spread across five tables as columns
   (`acceptedTs`, `responseTs`, `handoverTs`, `collectorConfirmedAt`, …). There is no single
   ordered "what happened to this lot" record, so there is nothing to render a timeline from
   and nothing to prove was not edited afterwards.
2. **`lot.status` never reaches `HANDED_OVER` on the server.** `grep -rn HANDED_OVER` finds it
   in `packages/core/src/constants.js`, in the demo seed, and in the phone's *local* SQLite
   (`client/app/src/db/repos/handovers.js:44`) — **never in `server/api/src`**. Every completed
   lot in Postgres is stuck at `IN_TRANSIT`. This is a live bug and this plan fixes it.
3. **Your step 6 has no endpoint.** The recycler's signature is auto-stamped when they
   *propose* the handover, before the collector has even seen it. There is no "the goods are
   physically in my yard, I have received them" action.
4. **No report, no document, no artefact the transaction leaves behind.**

---

## 3. THE STACK DECISION — read this before ordering `npm install`

### RECOMMENDATION

**Build the renderer behind a `renderReport(data) → Buffer` interface with two
implementations. Ship the pdf-lib one first; add the docxtemplater + LibreOffice one second.
Generate the PDF once, at receipt confirmation, store the bytes, and serve them as a static
file.**

Use your Vitto stack — `docxtemplater` + `pizzip` + `docxtemplater-image-module-free` +
`libreoffice-convert` + `pdf-lib` — as the **primary** renderer, because it is the only one
of the two that shapes Devanagari correctly and you already know it. But it must sit behind
an interface with a **pdf-lib-only fallback**, and the output must be **cached, never
generated on the click**.

### WHY

**Why the Vitto stack wins on the one thing that matters here: Marathi.**
The app is Marathi + Hindi (`README.md`, locked decisions). If the report carries a
Devanagari line — and it should, because a collector showing this at a bank is a real use
case — then `pdf-lib` alone **cannot render it**. pdf-lib embeds fonts and draws glyphs by
codepoint; it performs no OpenType shaping. Devanagari needs glyph reordering, matra
repositioning and conjunct substitution. Marathi text through raw pdf-lib comes out visibly
broken. LibreOffice does full HarfBuzz shaping and gets it right. That is the argument for
your stack, and it is a strong one.

**Why it cannot be the *only* renderer.**

- **`libreoffice-convert` shells out to `soffice`.** Railway's Nixpacks Node image does not
  have it. You would be adding a ~600 MB–1 GB system dependency to a deploy that currently
  builds in under two minutes, and the first conversion after a cold start pays 5–15 s while
  LibreOffice initialises its user profile. On a small instance, `soffice --headless` is a
  routine OOM-kill. The failure mode is: judge taps *Download report* → 30 s spinner → 502.
- **`libreoffice-convert` serialises badly.** Concurrent conversions collide on the same
  LibreOffice user-profile directory unless every call gets its own
  `-env:UserInstallation=file:///tmp/lo-<uuid>`. Two people tapping download at once is
  exactly what happens when a judge and a teammate are both on the laptop.
- **The reason docxtemplater exists in Vitto does not exist here.** In Vitto an *admin
  uploads* the `.docx` — a non-developer editing a legal agreement in Word was the
  requirement. Here the template author is your own team. Nobody outside the repo will ever
  edit this template. You are paying the full cost of the templating layer for none of its
  benefit.

**Why caching the PDF is the single most important line in this plan.**
Generate at receipt confirmation, store the bytes and the digest, serve the file. This buys
three things at once: (a) the demo download is a `readFile`, so LibreOffice's latency and
OOM risk are never on the critical path of a live demo; (b) the report becomes **immutable
evidence** rather than a re-derived view, which is the whole point of the feature; (c) you
can hash the stored PDF and print that hash on the PDF's own integrity block.

### ALTERNATIVES REJECTED

| Option | Why it lost |
|---|---|
| **pdf-lib only, no LibreOffice** | Cannot shape Devanagari. Kills the Marathi report and the "collector shows this at the bank" story. Kept as the *fallback* renderer (English-only, honest degradation) — not as the primary. |
| **Headless Chromium → `page.pdf()`** (Playwright is already a console dev-dep) | Genuinely tempting: perfect Devanagari, CSS layout, images as data-URIs, ~15 lines of code. Rejected because it is *another* ~400 MB system dependency with the same Railway problem, and because you have zero muscle memory for it under deadline whereas you have shipped the docx path before. **Revisit only if LibreOffice on Railway proves unfixable in the 2 h timebox in Task 12.** |
| **Client-side PDF in the app** (`expo-print`) | Report would exist only on one phone, could not be verified server-side, and the recycler console could not produce it. Defeats the traceability claim. |
| **HTML page instead of a PDF** | No artefact to hand over, print, email or file. A judge remembers a document; they do not remember a web page. |

### RISKS

| Risk | Mitigation |
|---|---|
| LibreOffice unavailable / OOM in production | `renderReport` catches, logs, falls back to pdf-lib renderer, records `renderer: 'PDFLIB_FALLBACK'` on the report row. Never a 500. |
| Devanagari renders as boxes in the fallback | Fallback renderer emits **English-only** and stamps `Rendered without Devanagari shaping` in the footer. Honest, not silently wrong. |
| Concurrent conversion corruption | Unique `-env:UserInstallation` per call **and** an in-process queue of concurrency 1 for the LibreOffice path. Generation is off the request path anyway. |
| Report generation fails on demo day | Demo data ships **one fully-completed transaction with its PDF already generated and committed**. The live demo produces a second one; if it fails, the pre-generated one is on screen in two clicks. |

### NEXT ACTION

Task 1 (schema) today. Task 12 (the LibreOffice-on-Railway timebox) **in parallel, by someone
else, today** — it is the only unknown in this plan and it must not block Tasks 1–11.

---

## 4. The data model

### 4.1 `TraceEvent` — the ledger

Append-only. There is no `UPDATE` on this table, ever — the same rule `Rate` already lives by.

```prisma
// The chain of custody. One row per thing that happened to a lot, in the order
// the server learned of it. APPEND ONLY.
//
// occurredAt vs recordedAt is not redundancy: the app is offline-first, so a
// collection at 09:14 in a basement may only reach the server at 11:40. The
// report prints both, because pretending the network was there is exactly the
// kind of thing this document exists to make impossible.
model TraceEvent {
  id         String   @id @db.Uuid                       // uuidv7
  lotId      String   @map("lot_id") @db.Uuid
  seq        Int                                          // 1..N per lot, server-assigned
  step       String                                       // see TRACE_STEPS
  actorRole  String   @map("actor_role")                  // COLLECTOR | RECYCLER | SYSTEM
  actorId    String?  @map("actor_id") @db.Uuid           // collector.id or recycler.id
  confirmed  Boolean  @default(false)                     // did a human explicitly confirm?

  occurredAt DateTime @map("occurred_at") @db.Timestamptz(6)   // device clock
  recordedAt DateTime @default(now()) @map("recorded_at") @db.Timestamptz(6) // server clock

  lat        Float?
  lng        Float?
  accuracyM  Float?   @map("accuracy_m")
  photoId    String?  @map("photo_id") @db.Uuid

  detail     Json?                                        // step-specific payload

  prevHash   String?  @map("prev_hash")                    // sha256 of previous event, this lot
  hash       String                                        // sha256(canonical(row) || prevHash)

  lot   Lot    @relation(fields: [lotId], references: [id])
  photo Photo? @relation(fields: [photoId], references: [id])

  @@unique([lotId, seq], map: "trace_event_lot_seq")
  @@index([lotId, seq], map: "trace_by_lot")
  @@index([step, recordedAt(sort: Desc)], map: "trace_by_step")
  @@map("trace_event")
}
```

Add to `packages/core/src/constants.js`:

```js
export const TRACE_STEPS = [
  "LOT_CREATED",                // collector, geo + LOT photo
  "LOT_READY",                  // collector, listed for offers
  "RECYCLER_ACCEPTED",          // recycler acknowledges the acceptance
  "TRANSIT_STARTED",            // collector departs
  "ARRIVED_AT_RECYCLER",        // collector, geo + HANDOVER photo
  "HANDOVER_PROPOSED",          // recycler posts inspected price
  "COLLECTOR_CONFIRMED",        // collector counter-signs
  "RECYCLER_RECEIPT_CONFIRMED", // recycler confirms physical receipt — closes the lot
  "DISPUTED",                   // terminal alternative to COLLECTOR_CONFIRMED
];
export const TRACE_ACTOR_ROLES = ["COLLECTOR", "RECYCLER", "SYSTEM"];
```

**Raw migration** (Prisma cannot express these):

```sql
ALTER TABLE trace_event ADD CONSTRAINT trace_event_step_check
  CHECK (step IN ('LOT_CREATED','LOT_READY','RECYCLER_ACCEPTED','TRANSIT_STARTED',
                  'ARRIVED_AT_RECYCLER','HANDOVER_PROPOSED','COLLECTOR_CONFIRMED',
                  'RECYCLER_RECEIPT_CONFIRMED','DISPUTED'));
ALTER TABLE trace_event ADD CONSTRAINT trace_event_actor_role_check
  CHECK (actor_role IN ('COLLECTOR','RECYCLER','SYSTEM'));
ALTER TABLE trace_event ADD CONSTRAINT trace_event_seq_positive CHECK (seq >= 1);
-- The two physical steps MUST carry evidence. This is the constraint that makes
-- "geo + photo" a property of the database rather than a promise in a slide.
ALTER TABLE trace_event ADD CONSTRAINT trace_event_evidence_required CHECK (
  step NOT IN ('LOT_CREATED','ARRIVED_AT_RECYCLER')
  OR (lat IS NOT NULL AND lng IS NOT NULL AND photo_id IS NOT NULL)
);
-- Append-only, enforced. A rule you can demo beats a rule you assert.
CREATE RULE trace_event_no_update AS ON UPDATE TO trace_event DO INSTEAD NOTHING;
CREATE RULE trace_event_no_delete AS ON DELETE TO trace_event DO INSTEAD NOTHING;
```

> The `DO INSTEAD NOTHING` rules make the table physically append-only at the Postgres level.
> This is a **60-second demo moment**: open `psql` in front of the judge, run
> `UPDATE trace_event SET lat = 0;`, watch it report `UPDATE 0`, and re-run the verify
> endpoint to show the chain still passes. See §8.
>
> ⚠️ These rules also block the `db:restore` path and the test-suite `TRUNCATE`. `TRUNCATE`
> is unaffected by rules, so `test/helpers/db.js` keeps working. Confirm `db-snapshot.js`
> restore uses `TRUNCATE`, not `DELETE`, before merging — this is a checklist item in Task 1.

### 4.2 `TraceReport` — the generated artefact

```prisma
// Never overwritten. A regenerated report is version n+1 with its own digest,
// so "which PDF did the judge see" always has an answer.
model TraceReport {
  id              String   @id @db.Uuid
  lotId           String   @map("lot_id") @db.Uuid
  handoverId      String   @map("handover_id") @db.Uuid
  referenceCode   String   @map("reference_code")
  version         Int      @default(1)

  chainHeadHash   String   @map("chain_head_hash")   // hash of the last TraceEvent at seal time
  eventCount      Int      @map("event_count")
  docSha256       String   @map("doc_sha256")        // digest of the PDF bytes themselves
  bytes           Int
  storageKey      String   @map("storage_key")       // <REPORT_DIR>/<id>.pdf
  accessToken     String   @map("access_token")      // 128-bit, in the QR URL — see §6 note
  renderer        String                              // LIBREOFFICE | PDFLIB_FALLBACK
  templateVersion String   @map("template_version")   // e.g. "handover-v1"
  generatedAt     DateTime @default(now()) @map("generated_at") @db.Timestamptz(6)

  lot      Lot      @relation(fields: [lotId], references: [id])
  handover Handover @relation(fields: [handoverId], references: [id])

  @@unique([lotId, version], map: "report_lot_version")
  @@index([referenceCode], map: "report_by_ref")
  @@map("trace_report")
}
```

### 4.3 The hash chain — and why it is not theatre

```
hash_n = sha256( canonicalJson({lotId, seq, step, actorRole, actorId, confirmed,
                                occurredAt, recordedAt, lat, lng, accuracyM,
                                photoId, photoSha256, detail}) + "\n" + (hash_{n-1} ?? "GENESIS") )
```

Chained **in server-insert order**, computed inside the same transaction as the insert. Not
"sealed" later: the chain is valid at every moment of the lot's life, including mid-flow.
Offline events arriving late get the next `seq` — the ledger records *the order the server
learned things*, and the report sorts for display by `occurredAt` while verifying by `seq`.

`photoSha256` is folded into the hash, which means **the photographs are covered by the
chain too**. Swap the image file on disk and verification fails.

The thing that stops this being crypto-cosplay is that you ship the verifier and it returns
a real answer:

```
GET /trace/:reference_code/verify
→ 200 { ok: true,  head_hash: "a3f9…", event_count: 8, verified_at: "…" }
→ 200 { ok: false, broken_at_seq: 5, expected: "a3f9…", actual: "0c21…" }
```

**Build the verify endpoint in the same task as the hashing.** Hashes without a verifier are
decoration; a verifier a judge can watch return `false` on a tampered row is a USP.

---

## 5. Where events get written (the eight call sites)

All through one helper, `server/api/src/lib/traceEvent.js`:

```js
// appendTraceEvent(tx, { lotId, step, actorRole, actorId, confirmed,
//                        occurredAt, lat, lng, accuracyM, photoId, detail })
// - takes the next seq for the lot inside the caller's transaction
// - loads prevHash from seq-1
// - computes hash (folding in photo.sha256 when photoId is set)
// - inserts
// Idempotent on (lotId, step) for the steps that can only happen once —
// a retried sync push must not double-write the ledger.
```

| # | Trigger | Step(s) emitted | File |
|---|---|---|---|
| 1 | `POST /public/lots` and `POST /sync/push` lot upsert | `LOT_CREATED` (geo + LOT photo) then `LOT_READY` | `routes/public.js:165`, `routes/sync.js` |
| 2 | `POST /recycler/acceptances/:id/respond` with `ACCEPT` | `RECYCLER_ACCEPTED` | `routes/recycler.js:193` — **inside the existing `$transaction`** |
| 3 | `POST /lots/:lot_id/depart` | `TRANSIT_STARTED` | `routes/lots.js:121` |
| 4 | `POST /handover` | `HANDOVER_PROPOSED` | `routes/handover.js` |
| 5 | `POST /handover/:lot_id/confirm` | `ARRIVED_AT_RECYCLER` (geo + HANDOVER photo) then `COLLECTOR_CONFIRMED` | `routes/handover.js` |
| 6 | `POST /handover/:lot_id/dispute` | `DISPUTED` | `routes/handover.js` |
| 7 | **NEW** `POST /handover/:lot_id/receipt` | `RECYCLER_RECEIPT_CONFIRMED` | `routes/handover.js` |
| 8 | backfill script for existing rows | reconstructs from `acceptedTs`/`responseTs`/`handoverTs`/`*ConfirmedAt`, `actorRole: 'SYSTEM'`, `detail.backfilled: true` | `scripts/backfill-trace-events.js` |

**Rule:** every append happens inside the *same* `$transaction` as the state change it
records. A ledger that can disagree with the tables it describes is worse than no ledger.

**Backfilled rows are labelled.** `detail.backfilled = true` and they render in a lighter
weight in the UI with the note *reconstructed from stored timestamps*. Do not let backfilled
rows masquerade as live-captured evidence — that is exactly the credibility trade this
project keeps making and keeps winning.

### 5.1 The new endpoint — `POST /handover/:lot_id/receipt`

```
POST /handover/:lot_id/receipt      requireSession (recycler)
guards:
  - handover exists, belongs to req.recycler.id
  - handover.status === 'CONFIRMED'  → else 409 { error: 'awaiting_collector_confirmation' }
  - not already receipted             → else 200 idempotent echo
writes, in ONE transaction:
  - handover.recyclerConfirmedAt = now   (re-stamped: this is the real receipt moment)
  - handover.receiptConfirmedAt  = now   (new nullable column — keeps the old value's meaning)
  - lot.status = 'HANDED_OVER'           ← fixes the live bug in gap 2
  - appendTraceEvent RECYCLER_RECEIPT_CONFIRMED
then, AFTER commit, fire-and-forget:
  - generateReport(lotId)   (same pattern as scoreHandover's fire-and-forget)
```

> **Decision:** add `receiptConfirmedAt` rather than redefining `recyclerConfirmedAt`.
> `entityAnomaly.js` and the history export already read `recyclerConfirmedAt`; changing what
> it means silently changes their output. New column, new meaning, nothing else moves.

Console: the `/verify` and `/history` pages get a **Confirm receipt** button on any handover
in state `CONFIRMED` with no receipt.

---

## 6. The report

### 6.1 What is on the page

One page, two if the timeline is long. Every claim traceable to a column.

| Block | Contents | Source |
|---|---|---|
| **Header** | `TRANSACTION RECORD` · reference code (large) · QR to the verify URL · generated-at | `handover.referenceCode` |
| **Parties** | Collector: pseudonymous short ID only. Recycler: name, MPCB `registrationNo`, `authorizationStatus`, `validityTo`, district | `Collector`, `Recycler` |
| **Material** | Category (English + Marathi), quantity + unit, declared condition, inspected condition, downgrade reason (plain-language) | `Lot`, `Category`, `Handover` |
| **Settlement** | Rate the collector saw (`buyerOfferSnapshot`), rate settled (`finalUnitPrice`), total (`finalTotal`), market reference (`referencePriceSnapshot` + `referencePriceStatus`) | `Handover` |
| **Chain of custody** | 8-row table: seq · step (plain language) · timestamp (`occurredAt`) · recorded (`recordedAt`) · confirmed by · status | `TraceEvent` |
| **Evidence** | Two photographs side by side — *At collection* and *At recycler* — each with its `sha256` printed beneath; the two coordinate pairs, the distance between them, the elapsed time | `Photo`, `TraceEvent` |
| **Critical minerals** | Estimated recovery for this lot, per mineral, each with its citation | Critical Mineral Ledger plan |
| **Integrity** | Chain head hash · event count · document digest · verify URL | `TraceReport` |
| **Legend** | `VERIFIED` / `ESTIMATED` / `DEMO` — every number on the page carries one | — |

Two rules that are non-negotiable:

- **DPDP.** No collector name, no phone, no photograph of a person. The `Collector` table has
  four columns for exactly this reason and the report must not undo that argument. The report
  says `Collector ID: 4f2a…c19` and nothing more.
- **Labelled numbers.** Every mineral figure prints `ESTIMATED` next to it, in the same type
  size as the number. Seeded-demo transactions print a `DEMO DATA` band across the header.
  A judge who finds one unlabelled estimate discounts the entire document.

### 6.2 The renderer interface

```
server/api/src/lib/report/
├── index.js              generateReport(lotId) — orchestration, storage, digest, TraceReport row
├── collect.js            gatherReportData(lotId) → the plain object both renderers consume
├── renderDocx.js         PRIMARY: docxtemplater + pizzip + image-module-free
│                                  → libreoffice-convert → pdf-lib audit-trail merge
├── renderPdfLib.js       FALLBACK: pdf-lib only, English-only, no Devanagari
├── auditTrail.js         pdf-lib: builds the chain-of-custody + integrity pages, merges them
│                                  (this is your mergeAuditTrailIntoPdf, ported)
└── templates/
    └── handover-v1.docx  the template, committed to the repo
```

`generateReport` is the only thing the routes call:

```js
export async function generateReport(lotId, { force = false } = {}) {
  const data = await gatherReportData(lotId);      // throws REPORT_NOT_READY if not receipted
  let pdf, renderer;
  try {
    pdf = await renderDocx(data);  renderer = "LIBREOFFICE";
  } catch (err) {
    log.report.warn("docx renderer failed, falling back", err);
    pdf = await renderPdfLib(data); renderer = "PDFLIB_FALLBACK";
  }
  pdf = await mergeAuditTrailIntoPdf(pdf, data);   // pdf-lib, both paths
  // …write to REPORT_DIR, sha256 the bytes, insert TraceReport at version = max+1
}
```

**Template placeholders** (`handover-v1.docx`) — flat scalars plus one loop and two images:

```
{referenceCode} {generatedAt} {recyclerName} {recyclerRegNo} {recyclerAuthStatus}
{collectorShortId} {categoryEn} {categoryMr} {quantity} {unit}
{declaredCondition} {inspectedCondition} {downgradeReason}
{buyerOfferRate} {finalUnitPrice} {finalTotal} {referencePrice} {referencePriceStatus}
{#events}{seq} {stepLabel} {occurredAt} {recordedAt} {actor} {status}{/events}
{%collectionPhoto} {%handoverPhoto}   ← image module
{collectionSha} {handoverSha} {collectionGeo} {handoverGeo} {geoDistanceKm} {elapsedHours}
{chainHeadHash} {eventCount} {verifyUrl}
```

Notes from the Vitto build that apply here:

- `docxtemplater-image-module-free` needs `getImage`/`getSize` callbacks; feed it the raw
  buffer from `PHOTO_DIR/<photoId>.bin` and a fixed size (e.g. `[220, 165]`) — do not let it
  size from the image or one landscape photo will blow the layout.
- Every `libreoffice-convert` call gets `-env:UserInstallation=file:///tmp/lo-${randomUUID()}`.
  Wrap it in a `p-limit(1)` queue regardless.
- The template must embed **Noto Sans Devanagari** for the Marathi lines, and the font must
  exist on the *server*, not just your laptop. Ship it in `templates/fonts/` and register it
  in the Nixpacks/Dockerfile step (Task 12).

### 6.3 API surface

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /trace/:reference_code` | none | JSON timeline, redacted (no collector id, no exact coords — a 3-decimal grid) |
| `GET /trace/:reference_code/verify` | none | `{ ok, head_hash, event_count, broken_at_seq? }` — recomputed live |
| `GET /reports/:reference_code.pdf?t=<accessToken>` | token | the PDF bytes, `Content-Disposition: inline` |
| `POST /handover/:lot_id/report` | recycler session | force regenerate → version n+1 |
| `GET /recycler/history` | recycler session | **add `report_url` to each row** |

> ⚠️ **`referenceCode` is 8 Crockford-Base32 chars = 40 bits, derived deterministically from
> the lot UUID.** It is a *human-readable reference*, not a secret. Do not gate the PDF on it
> alone — the whole transaction record (prices, MPCB registration, coordinates) would be
> enumerable. Hence `accessToken`: 128 random bits on the `TraceReport` row, present in the QR
> URL and in the links the console and app render. The JSON `/trace` endpoints stay public but
> redacted; the PDF needs the token.

---

## 7. Front-end

### Recycler console (`client/console`)

- `/verify` — after a handover reaches `CONFIRMED`, show a **Confirm receipt** button; after
  receipt, show the timeline and a **Download report** link.
- `/history` — a `Report` column with a PDF link per row.
- New `components/TraceTimeline.jsx` — the eight steps as a vertical timeline: filled node =
  confirmed, hollow = pending, thumbnail on the two evidence steps, `occurredAt` on the left
  and a small `recorded HH:MM` where it differs by more than 2 minutes.
- New `/trace/[ref]` page (unauthenticated) — the timeline + a **Verify integrity** button
  that calls the verify endpoint and renders a green PASS / red FAIL with the head hash. This
  page is the demo.

### Collector app (`client/app`)

- `LotsScreen` — each lot gets its current step and a compact 8-dot progress rail.
- New `LotTraceScreen` — the same timeline, in Marathi/Hindi, with voice labels (reuse
  `useVoice`), and a **My receipt** button that opens the PDF (`Linking.openURL` with the
  tokenised URL) and a **Share** action.
- The strings go in `src/i18n/strings.js` for `mr` and `hi` — eight step labels plus six
  report labels.

---

## 8. Demo choreography (why this feature earns its build time)

The 90 seconds this feature buys you, in order:

1. Collector app: create a lot. Photo + GPS. The timeline shows **step 1 of 8, confirmed**.
2. Console: accept. Timeline advances to 3 of 8, **live, on the projector**, both devices agreeing.
3. Collector: *Depart*. 4 of 8.
4. At the "yard": recycler posts the inspected price. 6 of 8.
5. Collector app: second photo + second GPS. 7 of 8.
6. Console: **Confirm receipt**. 8 of 8 — and the PDF link appears.
7. Open the PDF. Two photographs, two geotags, eight timestamps, both signatures, the
   integrity block.
8. Open `/trace/<ref>` on a second browser and hit **Verify integrity** → green.
9. **The kill shot.** Drop to `psql` on the projector:
   `UPDATE trace_event SET lat = 0 WHERE lot_id = '…';` → `UPDATE 0`. The table is
   physically append-only. Then, to show the chain is not just a claim, run the seeded
   tamper fixture (`scripts/demo-tamper.js`, which writes through a superuser bypass to a
   *throwaway* lot) and hit Verify → **red, broken at seq 5**.

Line to say at step 9, once, and not repeat:

> *"Every other traceability pitch in this room asks you to trust their database.
> Ours hands you the tool to check it."*

**Fallbacks:** the whole run is offline-capable except the console; if the hotspot dies, the
pre-generated demo transaction's PDF is on the laptop already and steps 7–9 run unchanged
against the local Postgres.

---

## 9. Tasks, in order, with estimates

| # | Task | Est. | Blocks |
|---|---|---|---|
| 1 | `TraceEvent` + `TraceReport` schema, migration, raw CHECK/RULE SQL, `TRACE_STEPS` in core; verify `db-snapshot.js` restore path survives the rules | 1.5 h | all |
| 2 | `lib/traceEvent.js` — append, canonical JSON, hash chain, `verifyChain(lotId)`; unit tests incl. a deliberately corrupted row | 2.5 h | 1 |
| 3 | Wire call sites 1–6 (§5) inside existing transactions | 3 h | 2 |
| 4 | `POST /handover/:lot_id/receipt` + `receiptConfirmedAt` column + **`lot.status = 'HANDED_OVER'` fix** | 1.5 h | 3 |
| 5 | `scripts/backfill-trace-events.js`, labelled `backfilled: true` | 1.5 h | 3 |
| 6 | `GET /trace/:ref` + `GET /trace/:ref/verify` (public, redacted) | 1.5 h | 2 |
| 7 | `lib/report/collect.js` + `renderPdfLib.js` + `auditTrail.js` — **the fallback ships first, so a PDF exists on day one** | 5 h | 3 |
| 8 | Storage, digest, `TraceReport` row, `GET /reports/:ref.pdf?t=`, `POST /handover/:id/report`, QR (`qrcode` npm) | 2.5 h | 7 |
| 9 | Console: `TraceTimeline.jsx`, Confirm-receipt button, report links on `/verify` + `/history`, public `/trace/[ref]` page | 4 h | 6, 8 |
| 10 | App: progress rail on `LotsScreen`, `LotTraceScreen`, mr/hi strings, report open + share | 3 h | 6, 8 |
| 11 | `handover-v1.docx` template + `renderDocx.js` (docxtemplater + image module + libreoffice-convert) behind the fallback | 6 h | 7 |
| 12 | **In parallel from day one:** LibreOffice + Noto Sans Devanagari on Railway — Nixpacks `aptPkgs`/`nixPkgs`, cold-start timing, memory headroom. **Timebox 2 h.** If it fails, ship fallback-only in production and the docx path locally for the demo | 2 h | — |
| 13 | Tests: chain integrity, append-only rules, evidence CHECK, receipt state machine, report generation both renderers, `/verify` PASS and FAIL | 4 h | all |
| 14 | Demo data: one completed transaction with a committed PDF + `scripts/demo-tamper.js` | 1.5 h | 8 |

**Total ≈ 34 h.**

### The cut line

If time runs out, ship in this order and stop wherever you are — every prefix is a coherent
product:

- **P0 (must ship, ~20 h):** Tasks 1, 2, 3, 4, 6, 7, 8, 13 — the ledger, the verifier, and a
  real PDF from the pdf-lib renderer. **This alone is the whole feature.**
- **P1 (~7 h):** Tasks 9, 14 — console timeline, public verify page, demo fixture. This is
  what makes it visible to a judge.
- **P2 (~7 h):** Tasks 10, 11, 12 — the app-side timeline, the Marathi docx renderer, Railway.

**If Task 11 slips, nothing breaks.** That is the entire reason for the interface in §6.2 and
the reason the fallback is built first — the opposite order would have you 6 hours into a
Word template with no PDF to show.

---

## 10. What this must NOT become

- **Do not build a blockchain.** The hash chain is a Merkle-style linked digest inside your
  own Postgres, and you should say exactly that when asked. A judge who hears "blockchain"
  will ask which chain, what the consensus mechanism is, who runs the nodes, and what it costs
  per transaction, and there is no good answer. The honest answer is stronger: *"Append-only
  table, hash-chained rows, and here is the verifier."*
- **Do not add a signature pad.** Both signatures are already the two confirmation endpoints
  plus the two geotagged photographs. A drawn squiggle adds a screen, a demo risk, and zero
  evidentiary value over a timestamped GPS fix and a hashed photograph.
- **Do not put the report on the request path.** Generate on receipt, serve the file.
- **Do not let backfilled events look live-captured.** §5, rule at the bottom.
- **Do not print an unlabelled number.** §6.1.

---

## 11. Open questions to settle before Task 1

1. **Report language.** Recommendation: **English body, Marathi/Hindi header block and the
   eight step labels bilingual.** This keeps the audit document in the language an auditor
   and a bank read, and keeps the collector-facing lines readable. Confirm before the template
   is authored — it changes §6.2's font requirement.
2. **Does the collector need the PDF on the phone, or is a share link enough?** A share link
   is 30 minutes; an on-device download with `expo-file-system` + `expo-sharing` is 2 hours.
   Recommendation: share link for now.
3. **Critical-mineral block in v1 of the report, or v2?** It depends on the coefficient
   sourcing in the other plan being done. Recommendation: leave the block in the template with
   a `{#hasMinerals}` conditional so it is a data problem, not a template problem.
