# Bhaav — SIH26229

**Problem statement:** SIH26229 — *Kabadiwala Connect: Bringing the Informal Collector into the Formal Recycling Chain*
**Sponsor:** Ministry of Mines / JNARDDC, Nagpur · **Theme:** Clean & Green Technology
**Team:** Vidyavardhini, Vasai West, Dist. Palghar, Maharashtra
**Idea submission deadline:** 20 September 2026

> **Product name is `Bhaav`.** "Kabadiwalla Connect" is a real Chennai social enterprise operating since 2014, and "The Kabadiwala" is a Bhopal company. Keep the PS title on the submission form; never present the product under either name.

---

## What we are building

An **offline-first Android app** that lets an informal e-waste collector photograph a lot, classify it in one tap, see what it is worth at **every nearby authorised recycler**, choose one on rate *and* distance, and complete a **counter-signed handover record** — plus a **web console** where recyclers publish rates, verify lots and see anomaly flags.

The one sentence:

> **The only system where going formal pays a collector more the same day — because the handover record it produces is worth money to the recycler, and that value is shared back at the point of sale.**

The three things that must exist:

1. **One loop that works offline** on a real phone
2. **One piece of evidence nobody else has** — real Vasai field data
3. **One number** — current ₹/kg vs platform ₹/kg, assumptions written down

---

## Read these in order

| Document | Answers |
|---|---|
| **[FLOW.md](FLOW.md)** | What the product does, end to end, for someone who has never seen it. **Start here.** |
| **[DB.md](DB.md)** | The schema. **Authoritative** — where any doc disagrees with it, `DB.md` wins |
| **[SERVER.md](SERVER.md)** | Stack, offline contract, API surface, sync protocol, the queries that matter |
| **[FRONTEND.md](FRONTEND.md)** | Both apps, screen by screen, with the design rules |
| **[AI.md](AI.md)** | Why no classifier, the eight detectors, dataset provenance, and the `server/aiml` contract (§11) |
| **[PRODUCT.md](PRODUCT.md)** / **[DESIGN.md](DESIGN.md)** | The decision dossier's product framing and visual system |
| **[mpcb_recyclers.csv](mpcb_recyclers.csv)** | 161 MPCB entries parsed. Seed data. Filter `status=VALID` → 74 |

Two published pages: the [ranking dossier](https://claude.ai/code/artifact/5d3bf9ee-5faa-4217-83d1-8584eb5d35ee) (why this PS beat nine others) and the [build plan](https://claude.ai/code/artifact/f3ff3419-d472-4903-a1c8-63fd385a90d8) (pitch, demo script, question bank).

---

## Locked decisions

| | |
|---|---|
| Language | **JavaScript** (not TypeScript) |
| Repo | **Monorepo** — `client/app`, `client/console`, `server/api`, `server/aiml`, `packages/` |
| Backend | **Express** + **PostgreSQL** + **Prisma** |
| App | **React Native / Expo**, **dev build**, **Android only**, target **Android 12** |
| Device DB | **SQLite** via `expo-sqlite`, raw SQL |
| Console | **Next.js** |
| Runtime | **Node 22**, **npm** |
| Containers | **None.** No Docker anywhere — Postgres and Python installed natively |
| Languages in app | **Marathi + Hindi** |
| Demo network | **Phone hotspot** (not USB — see below) |
| Priority | **Quality over deadline.** Functionality and collector-facing UX first, cosmetics last |

### Why Postgres, not MongoDB
The device DB is SQLite (also relational), the data is joins, the two-sided confirmation belongs in a `CHECK` constraint, and the detectors are window functions. See `SERVER.md` §1.

### Why no Docker for the app
`adb` cannot see a phone from inside a container on macOS, `--network host` is Linux-only, and Metro's file watching over bind mounts is unreliable. Expo runs natively; that is correct, not a compromise.

---

## Running it

Five processes. Wire `concurrently` at the root so `npm run dev` starts the API and console together.

```bash
# once
brew install postgresql@16 && brew services start postgresql@16
nvm use 22 && npm install

# db
npx prisma migrate deploy      # then apply the raw CHECK migration — see DB.md §3.7
npm run seed                   # idempotent, re-runnable from mpcb_recyclers.csv

# dev
npm run dev                    # api + console
cd client/app && npx expo start --dev-client
cd server/aiml && uvicorn main:app --reload
```

### Demo setup

**Laptop A** — Postgres + Express API + Next.js console in a browser
**Laptop B** — Metro, phone attached
**Phone** — dev build installed, data seeded, tested *on that device*

**Network: a phone hotspot, not USB.** `adb reverse` keeps working in airplane mode, so a USB-tethered demo makes the offline claim unprovable — and if a judge notices, the central claim looks staged. On a hotspot, airplane mode genuinely severs the connection. If USB is unavoidable, prove offline with the **pending-outbox counter climbing** instead.

---

## Ground rules — things we do not claim

These protect us under questioning. Each one has already nearly caught us out.

1. **`LAPSED_IN_LIST` ≠ unlawful.** It means the *published record* shows an expired date; many will have renewed without MPCB republishing. Never say or imply otherwise about a named business.
2. **Simulated data is labelled simulated** — on screen and in the deck. Every time.
3. **We trained no model.** Detectors are thresholds today. The honest framing and the roadmap are in `AI.md` §1 and §3.1.
4. **The record is not tamper-proof.** It makes fabrication expensive and detectable *at scale*. GPS can be spoofed; say so before a judge does.
5. **`condition_factor` (1.0 / 0.85 / 0.70) is a stated assumption**, not a measurement. Field data replaces it.
6. **Field rates are small and non-representative** — one town, one week, a handful of respondents. Say it first.
7. **No personal data is collected.** No name, no Aadhaar, no mandatory phone. Most of DPDP therefore does not attach — say *that*, not "DPDP compliant".

---

## Demo data — the recyclers

Eight named recyclers. **Three are currently valid, five show lapsed authorisations.** Seed all eight and let the filter do its work — this is the strongest live demonstration available to us:

> *"The closest authorised recycler to this campus on the public list is Eco-Recycling Ltd, in Vasai East. Our app will not send a collector there — its listed authorisation expired in December 2023. It routes to Bharat E Waste in Waliv instead. That filter is running on real government data, right now."*

| Recycler | Location | Valid to | |
|---|---|---|---|
| Lilashana Sales | Khamgaon, Buldhana | 29-02-2028 | ✅ have rates |
| Global E-Recycling | Wakanpada, Palghar | 29-02-2028 | ✅ |
| Eco Reset | Kamptee, Nagpur | 28-02-2027 | ✅ |
| Aman Trading Co. | Kurla (W), Mumbai | 31-05-2023 | ❌ have rates |
| Eco-Recycling Ltd. | Vasai (E), Palghar | 31-12-2023 | ❌ nearest to campus |
| Kohinoor E-Waste | Khalapur, Raigad | 31-05-2023 | ❌ |
| Go Green Recycling | Mahape, Navi Mumbai | 30-06-2024 | ❌ |
| New India Scrap Traders | Aurangabad | 30-06-2024 | ❌ |

**13 currently-valid operators exist in Vasai/Palghar** — Bharat E Waste (Waliv), E-Waste Mart and E Clean E Green (Nalasopara), New Ecotech (Khaniwade), S. N. Brothers (Dongaripada), OM R V Interiors (Pelhar), Star Envo (Pelhar), Wave E Waste (Palghar). Contact details in the CSV.

> **Hand-check any phone number before using it.** Some CSV rows picked up a number embedded in an email address (`rahimkhan9833542199@gmail.com`) instead of the real contact.

---

## Open items

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Confirm the `POST /detect` contract in `AI.md` §11 | AI developer | assumed agreed |
| 2 | Confirm Python + FastAPI, and which detectors are in scope | AI developer | **confirmed — Python + FastAPI. In scope: D1, D2, D3, D6, D7, D8, D9. D4, D5 not built (blocked on item 7)** |
| 3 | **Write `POST /simulate`** — without it there is nothing to demo the detectors on | AI developer | **confirmed — synthetic data, owned by AI developer** |
| 4 | **Geocode the permitted recyclers** — lat/lng, ~1 hour, blocks the ranking screen | assigned: whoever owns seed data | confirm |
| 5 | Field rates for Eco-Recycling Ltd and the Vasai valid list | — | open |
| 6 | Record ~60 Marathi + Hindi audio clips (8 category names, digits 0–9, "rupees", "kilo", "correct", "wrong", ~15 screen phrases) — pre-recorded, not runtime TTS. See `SERVER.md` §1 for why `expo-speech`/OS TTS is not used | assigned: design/frontend owner | confirm |
| 7 | Populate `category.expected_qty_min/max` from field data — was blocking D4/D5, now **not blocking** since D4/D5 are out of scope for this build | — | open, lower priority |
| 8 | Email JNARDDC, Nagpur with three specific questions — a quotable reply outranks any feature | — | open |
| 9 | **Add `handover.inspected_condition` and `handover.downgrade_reason_code`** to `DB.md` §3.7 — D9 cannot run without them | — | open, blocks D9 |

**Items 4 and 6 have an assumed owner, not a confirmed one** — assigned here so nothing enters the build with no name on it. Correct either before `/clear` if wrong; after that this table is what the next session trusts.

---

## Build order

1. Prisma schema from `DB.md` + the raw `CHECK` migration + seed from CSV
2. `GET /sync/bootstrap` returning categories, valid recyclers, current rates
3. **`POST /sync/push`** — idempotent upsert. Highest-risk piece, build it early
4. App S0 → S1 → S2 → S4 → S4b → S5 against local SQLite, no sync. **This is the demo spine**
5. S7 handover + QR + two-sided confirm; console rate publishing + counter-sign
6. `POST /handover/{id}/confirm` — closes the record
7. S6 accept + outbox + console acceptances
8. Ledger, price board, safety cards, S3 clarifying questions, staleness indicators
9. Detectors D1/D6/D7/D8 + flags screen; then D2/D3 against simulated history; then D9 once item 9 (schema) lands

**Never cut 3 or 6** — they are the offline claim and the two-sided signature, which are the two things being demonstrated.
