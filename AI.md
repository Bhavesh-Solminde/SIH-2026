# AI / ML Specification — SIH26229

**Problem statement:** SIH26229, Kabadiwala Connect (Ministry of Mines / JNARDDC)
**Companion documents:** `FRONTEND.md`, `SERVER.md`

---

## 1. The decision, and the clause that permits it

**We do not ship a material-classification model. Categorisation is a human tap on an icon grid. Our AI/ML effort goes to anomaly detection over transaction data.**

The brief's own wording allows this, and the qualifying clause is load-bearing:

> *"Use the collected material image, category, weight, location, historical price, and transaction data to support AI/ML-based features **such as** material classification, approximate valuation, recycler matching, and identification of abnormal or inconsistent transaction values, **wherever sufficient training data is available**."*

Two things follow. **"Such as"** makes the list illustrative, not mandatory. **"Wherever sufficient training data is available"** is an explicit instruction to be honest about what the data supports — and no dataset of Indian informal-scrap imagery exists.

### Why the tap beats the model here

| | Icon tap | Image classifier |
|---|---|---|
| Accuracy | Effectively 100% — the collector is holding the material | ~85% optimistic, on borrowed non-Indian data |
| Needs good light | No | Yes |
| Needs network | No | Yes, unless quantised on-device |
| Cost when it fails | N/A | Wrong category → wrong price |
| Sub-category (PCB grade, battery chemistry) | Resolved by one picture question | **Not resolvable from any photograph** |

The collector knows a copper wire better than a classifier does. **We spend AI where a human genuinely cannot help — finding patterns across thousands of transactions that no individual participant can see.**

### The honest risk, stated plainly

This is not a stronger AI story than classification. It is a *different* one. A classifier has borrowed public data to train on; anomaly detection at the internal round has **no transaction history at all** and therefore runs as **defined thresholds, not learned models**. If a judge asks "what did you train?", the answer today is "nothing — and here is exactly when that changes."

Do not hide this. Section 3 is the answer that makes it a strength.

---

## 2. What each feature actually is

The brief names four AI/ML features. Be precise about which are models and which are arithmetic — a team that knows the difference reads as one that understands the problem.

| Brief's feature | What we ship | Honest label |
|---|---|---|
| Material classification | Icon grid + conditional picture question | **Human input.** Not a model, by choice |
| Approximate valuation | `quantity × rate` from the cached rate table | **Lookup.** A regression on eleven observations would be pretending |
| Recycler matching | Weighted score over rate, distance, materials accepted, pickup, authorisation status | **Rule-based ranking.** Explainable, and correct for the job |
| Abnormal / inconsistent transaction values | Eleven detectors in scope — D1, D2, D3, D6, D7, D8, D9, D10, D11, D12, D13. D4 and D5 are registered but permanently skip (blocked on per-category weight/value distributions that do not exist); D14 was never built | **Statistical rules now, learned thresholds once history exists** |
| Price trends | Time series over the append-only `rate` table | **Charting.** Not prediction |
| Price *prediction* | Not shipped | Requires a history we will not have for months |

### The recycler-matching score

```
score = w1 · normalised_value  −  w2 · normalised_distance
        + w3 · pickup_available
        − w4 · rate_staleness_days

eligibility gate (hard filter, applied before scoring):
    authorization_status == VALID
    AND category ∈ materials_accepted
    AND distance ≤ service_area_km
```

Default weights `w1=0.55, w2=0.30, w3=0.10, w4=0.05`, tuned by hand and **shown in the deck**. A collector can re-sort by pure distance or pure value. Ranking is explainable by design — an opaque recommendation to a low-literacy user is a bad product regardless of accuracy.

---

## 3. The dataset — how the brief's requirement is satisfied

The brief's requirement, clause by clause:

| Requirement | How we satisfy it |
|---|---|
| *"appropriately sourced datasets containing material images…"* | Every lot carries 1–4 photographs, captured by the user, licence-free because self-collected |
| *"…material categories…"* | Each photograph is paired with a **human-verified category label** — the collector's own tap |
| *"…weights, prices, locations…"* | `lot.quantity`, three price fields, two geotags per transaction |
| *"…and transaction records"* | `lot` + `acceptance` + `handover`, with both parties' confirmations |
| *"clearly identify the source, quality, size, and limitations"* | Section 4 below. Written for the deck, not buried |
| *"support data cleaning, validation, anonymization"* | Section 6 |
| *"historical analysis, price prediction, material classification, recycler recommendation, transaction-level traceability"* | Section 7 — what each will support and when |
| *"demonstrate how the dataset is **generated**, stored, validated, updated, and used… rather than treating the dataset as a static database"* | **Section 3.1 — this is our strongest answer** |

### 3.1 The application *is* the dataset generator

This is the argument to lead with, and it converts the dropped classifier into a roadmap:

> **There is no dataset of Indian informal e-waste imagery. That is precisely why we do not claim a trained classifier. But every lot in our app is a photograph paired with a human-verified category label — the collector's tap *is* the annotation. The application is a labelling pipeline that runs as a side-effect of people getting paid. After a few thousand lots we hold the dataset that does not exist today, and only then does the classifier become honestly trainable.**

The dataset is therefore **generated by use, not shipped as a file** — exactly what the brief asks for and what most teams will fail to demonstrate.

### 3.2 The generation loop

```
collector photographs a lot
        │
        ├─► photo + human category label  ──►  image corpus  ──► future classifier
        ├─► quantity + unit               ──►  weight distributions per category ──► detector D4
        ├─► accepted rate (frozen)        ──►  price series ──► trends, detectors D1–D3
        ├─► final price (both-confirmed)  ──►  price series
        └─► two geotags + two timestamps  ──►  traceability ──► detectors D6–D8
```

Every arrow is a by-product of a transaction someone wanted to make anyway. Nothing is collected for its own sake — which is also the privacy argument.

---

## 4. Datasets: source, quality, size, limitations

The brief requires this table explicitly. **Put it in the deck verbatim.**

### 4.1 Recycler dataset — *primary, in hand*
- **Source:** Maharashtra Pollution Control Board, published list of Authorized E-waste Recyclers & Dismantlers. Public government document. Cite the URL and download date.
- **Size:** 161 entries, 21 pages. 74 currently valid, 87 lapsed.
- **Quality:** Authoritative for authorisation status. Addresses are free-text and require manual geocoding. **87 of 161 rows show a validity date that has already lapsed** — only 74 are current.
- **Limitations:** The published list is stale relative to reality; a lapsed date means *the record* is out of date, **not** that the facility is operating unlawfully. Contains no rates. No machine-readable format — extracted with `pypdf` and hand-checked.

### 4.2 Price dataset — *generated by us*
- **Source (tier 1, authoritative):** rates collected directly — field visit to a scrap dealer, plus telephone calls to authorised recyclers from the MPCB list. Each row labelled `FIELD_COLLECTED` with location, date and respondent.
- **Source (tier 2, context only):** published scrap-rate aggregator sites, labelled `MARKET_INDICATIVE`, used for the brief's "approximate market range" column and **never shown to a collector as the price**.
- **Source (tier 3, benchmark):** Indian Bureau of Mines monthly bulletin (LME prices for Al, Cu, Pb, Ni, Sn, Zn). Monthly, ex-mine/LME, not scrap. Used only as a sanity band.
- **Size at internal round:** realistically 15–40 rate observations across 7 categories and 5–10 respondents.
- **Quality:** Small but genuinely observed and dated. Better than any synthetic alternative.
- **Limitations:** **Not statistically representative.** One city, one week, a handful of respondents. Rates quoted on the phone may be indicative rather than transactional. Say this out loud before a judge says it.

### 4.3 Transaction dataset — *does not exist yet*
- **Source:** produced by the application in use.
- **Size at internal round:** whatever the demo generates, plus **clearly-labelled simulated history** for exercising the detectors.
- **Limitations:** **This is the binding constraint on everything in this document.** Detectors D2, D3 and D4 need a minimum volume before their output means anything (see §5). Until then they are defined and demonstrated, not validated.

### 4.4 Image corpus — *accumulating, not yet trained on*
- **Source:** photographs taken by the team during field work, plus every lot photographed in the app. Self-collected, so no licensing question.
- **Optional pre-training:** public sets exist — Roboflow's E-Waste Dataset (~19,600 images) and a balanced variant (~7,216), and a Kaggle set (~3,600, ~300/class). **Check and record the licence of each before use.**
- **Critical limitation:** those public sets classify *devices* on UNU-KEYS (keyboards, printers, washing machines). Our taxonomy is *materials* (PCB, cable, battery). **The taxonomies do not match**, which is a second reason not to claim a trained classifier.

---

## 5. The anomaly detectors

Thirteen detectors are defined; **eleven are built and in scope** — D1, D2, D3, D6, D7, D8, D9, D10, D11, D12, D13 (`server/aiml/bhaav_aiml/config.py::IN_SCOPE`). D4 and D5 are registered in the detector code but **permanently skip with a reason** — both are blocked on real per-category weight/value distributions that do not exist (open item 7); they are not "not yet run", they will never run in this build. D14 (evidence-photo reuse) was never built — see `AI-ANOMALY-SPEC.md` §6.3.

Each has a subject, a rule, a threshold, a minimum-data precondition, and a stated false-positive risk. **Preconditions matter: some work on the first transaction, some do not work until there is history.** Never show a detector firing on data too thin to support it.

Let `P_est` = estimate the collector saw, `P_pub` = published rate frozen at acceptance, `P_final` = amount actually paid and confirmed by both parties.

| # | Detector | Subject | Rule | Default threshold | Min data | Catches | False-positive risk |
|---|---|---|---|---|---|---|---|
| **D1** | Price deviation | Handover | `abs(P_final − P_pub) / P_pub` | `> 0.25` | 1 | Underpayment, or a badly wrong estimate | **High** — a normal negotiation after inspection can exceed this. `INFO` severity only |
| **D2** | Systematic underpayment | Recycler | `median(P_final / P_pub)` over last *N* lots | `< 0.85` | **N ≥ 10** | Publishing a high rate, paying a low one | Low. The strongest detector in the set |
| **D3** | Bait pricing | Recycler | Day-on-day change in published rate | `> 30%` and reverting within 72h | **≥ 7 days of rate history** | Advertising a rate to attract collectors, then dropping it | Medium — genuine metal-market moves exist. Cross-check against the IBM/LME band |
| **D4** | Weight outlier | Lot | `quantity` outside `[p5, p95]` for the category | per-category, from field data | **≥ 30 lots per category** | Gutted devices, wrong unit, decimal typo | Medium. Depends entirely on having real distributions |
| **D5** | Value density | Lot | `P_final / quantity` outside category norm | ±2σ | **≥ 30 lots per category** | Misdeclared category — low-grade board sold as high-grade | Medium |
| **D6** | Duplicate lot | Lot | Same collector, same category, quantity within ±2%, within 15 min | — | 1 | Double-counting the same material | Low |
| **D7** | Impossible travel | Handover | `distance(collection, handover) / (t_handover − t_collection)` | `> 80 km/h` | 1 | Fabricated provenance | Low. Tune for highway travel |
| **D8** | Clustered handovers | Recycler | ≥ 5 handovers within 60s at coordinates inside a 10 m radius | — | 1 | Bulk-fabricated records | Low |
| **D9** | Grader bias | Recycler | `mean` over shared collectors of `(downgrade rate this recycler − downgrade rate other recyclers, same collector)` | `bias > 0.35` → `WARN`; `> 0.60` at n≥20 → `CRITICAL` | **≥ 10 collectors shared with another recycler, each sold to ≥ 2 recyclers** | A recycler who declares material POOR to justify a price cut regardless of the collector's actual quality — where D1/D2 alone cannot separate this from a recycler who genuinely, consistently receives poor-quality material | **Low where overlap exists.** Two recyclers under common ownership (shared address/phone) are one grader in two hats and will falsely clean each other's bias score — flag shared ownership as a confidence caveat in `detail`. **Unidentifiable, not just noisy, with no shared collectors** — must skip with a reason, never guess |
| **D10** | Downgrade change-point | Recycler | Split a recycler's own dated handovers at the midpoint of their active window; compare the downgrade rate before vs after | `step ≥ 0.30` (absolute rise in downgrade rate) → `WARN` | **≥ 60 days span, ≥ 20 handovers, ≥ 8 per window** | A recycler who was honest, then flips policy — the step in rate is the tell, not the level | **Blind to anyone who lied from day one** — their rate never steps because it was always high. D11 and D12 cover that case |
| **D11** | Cross-category downgrade uniformity | Recycler | Variance of downgrade rate across a recycler's own categories | `variance ≤ 0.02` at `mean ≥ 0.60` → `WARN` | **≥ 3 categories, ≥ 10 handovers each** | Uniform downgrading across materially different categories — genuine quality problems are category-specific; lying is uniform | A recycler who genuinely, coincidentally, receives poor material across every category they handle (rare but possible) |
| **D12** | Offers that never learn | Recycler | A persistent published-vs-paid gap **AND** a published rate that has not meaningfully fallen, evaluated together | `mean_drop ≥ 0.20` **and** `rate_fall < 0.15` over the window → `WARN` | **≥ 15 handovers over ≥ 30 days** | A recycler whose published rate stays high (to keep winning lots) while consistently paying much less. The two-condition **AND** is deliberate: an honest low-grade recycler lowers their own published rate and is exonerated; a liar cannot lower theirs without losing the lot | **Low** — the conjunction is specifically what separates the honest low-grade recycler from the liar; either condition alone would catch the honest case too |
| **D13** | Single-buyer market | `MARKET` (not a person) | A district has exactly one currently-valid recycler and a high downgrade rate | `downgrade_rate ≥ 0.60` → `MARKET` finding | **≥ 20 handovers** | Recognises that recycler bias is mathematically unidentifiable with no second recycler to compare against — flags the market structure, not a person | None by construction — this is a finding about market structure, never an accusation against a business |

**D9 needs data the schema does not yet capture.** `lot.condition` is the collector's declaration at creation; nothing today records what the recycler inspected it as at handover. `handover` needs `inspected_condition` (`GOOD`/`FAIR`/`POOR`) and `downgrade_reason_code`, or D9 has nothing to compute over.

**Why D9 exists, and what it cannot do alone.** A recycler who lies about condition to justify a cut is indistinguishable, per transaction, from one who genuinely keeps receiving poor material — same low price, same reason code, same real photos of real poor material, since the recycler authors all three. D9 resolves it by comparing recyclers against each other **on the same collectors**: a genuine low-grade recycler's downgrades track what every other recycler says about those collectors (`bias ≈ 0`); a lying recycler's downgrades do not (`bias` high). It needs no image analysis and no admin judgement — only cross-recycler agreement, which the liar cannot fake without colluding with a competitor.

### Which detectors to lead with

**D2 and D3.** Both protect the *collector*, which is who the problem statement is about, and both target the exact gaming vector our own design creates — a recycler could publish an attractive rate to win the ranking and then pay less at the counter. Being able to name the way your own system could be abused, and show the detector for it, is a strong answer.

**D9 is the standout for Q&A.** It is the one detector that answers "what did the model catch that a threshold couldn't?" — because D1 and D2 flag a genuinely low-grade-but-honest recycler exactly the same as a lying one, and D9 is what tells them apart. Demonstrating that separation on simulated data (an honest low-grade profile vs. a systematic-liar profile, both flagged identically by D2, separated only by D9) is worth more in the room than the other eight detectors combined.

### Severity and action

| Severity | Meaning | Action |
|---|---|---|
| `INFO` | Worth recording, not worth interrupting anyone | Logged only |
| `WARN` | Visible to the recycler on their own flags screen | Shown, not blocking |
| `CRITICAL` | Pattern-level, repeated | Surfaced to the ministry/administrator view |

**No detector ever blocks a transaction.** The system observes; it does not adjudicate. A false positive must never cost a collector a sale.

### Conditions the detector layer must obey

1. **Never fire below the stated `Min data`.** Show "insufficient data" rather than a meaningless flag.
2. **Every flag stores the numbers that triggered it** in `anomaly_flag.detail`, so it is explainable in one sentence.
3. **Flags are visible to the flagged party.** The system is not covert — a recycler sees their own flags.
4. **Thresholds are configuration, not code.** They will be wrong at first and must be tunable without a release.
5. **Single events are `INFO`; patterns are `WARN`/`CRITICAL`.** One gap is a negotiation. Ten gaps in the same direction is a finding.

---

## 6. Cleaning, validation and anonymisation

**Validation at write time** — unit matches the category's allowed units; quantity within absolute sanity bounds; both geotags present or explicitly marked absent; `handover` rejected unless both confirmation timestamps are set.

**Cleaning** — de-duplicate photos by `sha256`; normalise recycler names and addresses from the MPCB extraction by hand (161 rows, one afternoon); drop rate rows whose source is unrecorded.

**Anonymisation** — collectors are pseudonymous UUIDs with no name, no Aadhaar and no mandatory phone number, so **there is no personal data to anonymise at rest**. For any published or exported aggregate: coarsen location to ward level, suppress any cell with fewer than 5 contributing collectors (k-anonymity, k=5), and never export a collector ID with a location trail.

Because no identifiable personal data is collected, most DPDP Act 2023 obligations do not attach in the first place. **State it that way. Do not claim blanket "DPDP compliance."**

---

## 7. What the dataset will support, and when

| Capability | Status now | Unlocks at |
|---|---|---|
| Transaction-level traceability | **Working** | Day one |
| Recycler recommendation | **Working** (rule-based) | Day one |
| Historical price analysis / trends | **Working** (charting) | ~30 rate observations |
| Anomaly detection D1, D6, D7, D8 | **Working** (thresholds) | Day one |
| Anomaly detection D2, D3 | Defined, not validated | 10–30 records per subject |
| Anomaly detection D9, D10, D11, D12, D13 | **Built.** `handover.inspected_condition`/`downgrade_reason_code` are now schema columns (`DB.md` §3.7). Exercised against simulated adversarial recycler profiles via `bhaav_aiml/evaluate.py` — recall 1.0, precision 1.0 on the three planted bad actors (systematic liar, late-onset liar, monopolist) — but **not yet validated against real transaction history** | D9 needs ≥ 10 collectors shared across recyclers; D10 needs ≥ 60 days/≥ 20 handovers; D11 needs ≥ 3 categories; D12 needs ≥ 15 handovers/≥ 30 days; D13 needs ≥ 20 handovers in a single-recycler district |
| Anomaly detection D4, D5 | **Out of scope for this build, permanently** | Blocked on real per-category weight/price distributions (open item 7). They are registered detector codes that always skip with a reason, not detectors pending activation |
| Material classification | **Not shipped** | ~500 labelled images/class from real use |
| Price prediction | **Not shipped** | Months of per-category, per-location series |

Put this table in the deck. Telling a judge exactly what you did not build, and what would unlock it, is more convincing than any accuracy figure.

---

## 8. Evaluation with no ground truth

There is no labelled set of "true frauds," so accuracy cannot be reported. Two defensible substitutes:

1. **Synthetic injection.** Generate simulated transaction history, inject *N* known anomalies of each type, and report **recall per detector** — "D2 caught 9 of 10 injected underpayment patterns at N=10." This is honest, reproducible, and demonstrable in the room.
2. **Precision by manual review.** Of the flags raised, how many survive a human look. Report at a fixed alert budget — "at a threshold of 0.25, D1 flagged 12% of transactions, of which 3 of 14 were judged genuine."

**Label all simulated data as simulated, on screen and in the deck.** Presenting synthetic transactions as real is the single fastest way to lose a hackathon on integrity grounds.

---

## 9. Known limitations — say these before a judge finds them

> **Superseded (2026-09-07):** point 1 below described the shipped decision as it stood
> through the internal round — rule-based detectors, no model in the live path. That has since
> changed: the live product now scores every transaction with the deployed price model
> (`POST /predict`) and decides RECYCLER/COLLECTOR-level anomaly status from the share of a
> party's own scored transactions the model flagged, not from D1–D13. See
> `AI-ANOMALY-SPEC.md` §0.1 for the full note and `server/api/src/lib/entityAnomaly.js` for the
> implementation. Points 2–6 below are otherwise unaffected — read point 1 as historical.

1. **No trained model ships at the internal round.** Detectors are rules with tuned thresholds.
2. **Seven of eleven in-scope detectors (D2, D3, D9, D10, D11, D12, D13) cannot be validated against real transaction history** — there isn't enough of it yet. They are specified, implemented, and demonstrated against simulated adversarial profiles instead (`bhaav_aiml/evaluate.py`: recall 1.0, precision 1.0 on the three planted bad actors). D1, D6, D7, D8 work from the first real transaction.
3. **The price dataset is small and non-representative** — one city, one week, a handful of respondents.
4. **Weight-based detectors depend on distributions we do not yet have**, which must come from real field data, not assumption.
5. **GPS can be spoofed and photographs can be reused.** The record is not tamper-proof. What it does is make fabrication *expensive and detectable at scale* — you would need a distinct photo, a plausible place, a consistent time and a second party's confirmation for every lot. Today the first mile has none of those, which is how a certificate market ends up with claims at many multiples of actual capacity.
6. **The public image datasets classify devices, not materials**, so they are not directly reusable for our taxonomy.

---

## 10. Build order

> **This section is the original build plan and is now historical — all of steps 1–7 below are done.** The finished scope is **eleven detectors: D1, D2, D3, D6, D7, D8, D9, D10, D11, D12, D13** (`AI-ANOMALY-SPEC.md` §6.3 added D10–D13 after this plan was written). **D4 and D5 remain permanently out of scope** — both are blocked on real per-category weight/price distributions that do not exist (open item 7); they stay specified, not implemented, and the deck says so.

1. ~~Define the seven in-scope detectors as pure functions over the transaction tables~~ — done; eleven detectors now, no ML dependency, no framework
2. ~~Simulated-history generator with injectable anomalies~~ — done, including the five labelled recycler archetypes (`honest`, `honest_low_grade`, `systematic_liar`, `late_onset_liar`, `monopolist`) needed to separate D9/D10/D12/D13
3. ~~D1, D6, D7, D8~~ — done, work from the first transaction
4. ~~Flags screen in the recycler console with plain-language reasons~~ — done, plus an operator-triggered "Run detection" button
5. ~~Rate-trend chart from the append-only `rate` table~~ — the simulator now emits a dated rate series; charting itself is a console concern
6. ~~D2, D3~~ — done, run against simulated data; D3 needed the dated rate series to be reachable at all
7. ~~D9~~ — done. `handover.inspected_condition` and `downgrade_reason_code` are schema columns; **D10, D11, D12, D13 also shipped**, beyond what this plan originally scoped
8. Populate `expected_weight_min/max` from field data → D4, D5 — **still open, still blocks D4/D5 permanently**
9. Image corpus accumulation with labels — collect, do not train — **still open, unchanged**

**Historical — see the superseded note above.** This paragraph described detection firing on every confirmed handover via `POST /detect`; that call no longer exists. Scoring now happens once, at handover creation, via the deployed price model, with the result aggregated per party (`entityAnomaly.js`) rather than run per-detector — the `includeInfo` / D1 alert-budget mechanics described here no longer apply, since D1 is not in the live path. `GET /recycler/flags` still exists and still excludes `resolvedAt`-set flags by default; it now serves `ML_PRICE_ANOMALY` (per-transaction) and `ML_FLAG_RATE` (per-party) flags instead.

---

## 11. Integration contract — `server/aiml`

The AI service is owned by a different person from the API. This contract is the seam; agree it before either side writes code, and neither of you is ever blocked.

### Ownership

| Owns | Who |
|---|---|
| `server/aiml` — the service, the detectors, the simulated-history generator | **AI developer** |
| `server/api` — calling `/detect`, writing `anomaly_flag`, the console flags screen | **Backend** |
| This contract | Both. It does not change without both agreeing |

### Rules

1. **The service is stateless and has no database access.** Everything it needs arrives in the request body. Either side can then be rebuilt, mocked or swapped without touching the other.
2. **The service never writes.** It returns findings; the API decides what to persist.
3. **Same input must produce same output.** No randomness, no wall-clock reads — `as_of` comes in the request.
4. **Skipped detectors must be reported, with a reason.** This is how the minimum-data rule in §5 is enforced across the seam, and it is what makes the demo honest.

### `GET /health`

```json
{ "status": "ok", "detectors": ["D1","D2","D3","D6","D7","D8","D9","D10","D11","D12","D13"] }
```

### `POST /detect`

**Request** — the API sends whatever slice of history it wants scored:

```json
{
  "run_id": "018f…",
  "as_of": "2026-09-02T18:00:00+05:30",
  "categories":  [ { "id":"…", "code":"PCB", "expected_qty_min":0.2, "expected_qty_max":40.0 } ],
  "recyclers":   [ { "id":"…", "name":"…", "lat":19.38, "lng":72.83 } ],
  "rates":       [ { "recycler_id":"…", "category_id":"…", "unit":"KG",
                     "price":420.00, "valid_from":"2026-09-01T09:00:00+05:30" } ],
  "lots":        [ { "id":"…", "collector_id":"…", "category_id":"…", "unit":"KG",
                     "quantity":3.000, "condition":"FAIR", "estimated_value":1071.00,
                     "collection_lat":19.38, "collection_lng":72.83,
                     "collection_ts":"2026-09-02T10:14:00+05:30" } ],
  "acceptances": [ { "id":"…", "lot_id":"…", "recycler_id":"…", "accepted_rate":420.00,
                     "accepted_unit":"KG", "accepted_ts":"2026-09-02T10:15:00+05:30",
                     "recycler_response":"NONE" } ],
  "handovers":   [ { "id":"…", "lot_id":"…", "recycler_id":"…", "inspected_quantity":2.900,
                     "final_unit_price":390.00, "final_total":1131.00,
                     "inspected_condition":"POOR", "downgrade_reason_code":"POOR_CONDITION",
                     "handover_lat":19.41, "handover_lng":72.80,
                     "handover_ts":"2026-09-02T12:40:00+05:30", "status":"CONFIRMED" } ]
}
```

`inspected_condition` and `downgrade_reason_code` are not yet columns on `handover` in `DB.md` — required for D9, see §5. `downgrade_reason_code` is `NULL` unless `inspected_condition` is a lower grade than `lot.condition`.

**Response:**

```json
{
  "run_id": "018f…",
  "detectors_run": ["D1","D6","D7","D8"],
  "detectors_skipped": [
    { "code":"D2", "reason":"insufficient data: 4 handovers for recycler 018f…, need 10" },
    { "code":"D9", "reason":"insufficient overlap: 3 collectors shared with another recycler, need 10" }
  ],
  "flags": [
    { "detector_code":"D2", "subject_type":"RECYCLER", "subject_id":"018f…",
      "severity":"WARN",
      "detail": { "median_ratio":0.78, "n":14, "threshold":0.85 } }
  ]
}
```

`flags[]` maps **field-for-field** onto the `anomaly_flag` table in `DB.md`. The API inserts them unchanged.

`detail` must always contain the triggering numbers, because the console renders a plain-language sentence from them and every flag has to be explainable.

### `POST /simulate` — owned by the AI developer

Generates labelled synthetic history so the detectors can be exercised and evaluated before any real transactions exist.

```json
{ "n_collectors":20, "n_recyclers":8, "n_lots":600, "days":45,
  "inject": { "D2":3, "D3":2, "D4":5, "D6":4, "D7":2, "D8":1 } }
```

Returns the same shape as the `/detect` request body, plus `ground_truth[]` listing every injected anomaly — which is what makes the recall figures in §8 computable.

> **Everything produced by `/simulate` must be labelled simulated on screen and in the deck.** Presenting synthetic transactions as real is the fastest way to lose on integrity rather than on merit.

---

## 12. A second model this document has never described — `POST /predict`

Everything above (§11) is the pattern-detector contract with `server/aiml`, reached via `callDetect()`. There is a **second, separate, already-deployed** ML integration that no document mentions until now: `callPredict()` in `server/api/src/lib/aiml.js`, which calls `POST {AIML_PREDICT_URL ?? "https://sihmodel.vercel.app"}/predict` automatically from `scoreHandover()` after every confirmed handover.

**These are two different services and must never be pointed at the same host** — `aiml.js` itself carries a comment warning that doing so silently 404s whichever route the host lacks, invisibly, because both callers fail open.

- **Payload:** `{ reference_price, buyer_offer_per_kg, final_price_per_kg, condition }`.
- **Response:** `{ anomaly, score, threshold, risk_level, features }`.
- **The payload was degenerate until today.** `reference_price` and `buyer_offer_per_kg` were sent as the *same* number (`acceptance.acceptedRate`), which pinned `buyer_reference_ratio` at a constant `1.0` and collapsed `negotiation_gap_pct` into a duplicate of `abs_price_deviation_pct` — two of the model's five features carried zero incremental information. Fixed: `reference_price` is now the median published rate among the *other* `VALID` recyclers in that category — a real market reference, independent of what this recycler is paying.

**An open honesty question — not resolved here.** `README.md` ground rule 3 says "we trained no model," and `AI-ANOMALY-SPEC.md` §0.1 explicitly rejected a hybrid Isolation Forest for the pattern-detector side of this project. The response shape from `sihmodel.vercel.app` — a continuous `score` compared against a fixed `threshold` — is consistent with a trained model's `decision_function` output (e.g. an sklearn `IsolationForest`). **This is an inference from the response shape, not a confirmed fact.** Whoever built and deployed that model needs to confirm, one way or the other, before the deck says either "we trained no model" (if it turns out this one is trained) or claims it as a trained-model result (if it is not). Do not state either in the deck until that confirmation exists.

**DLT sender-ID registration** for outbound SMS (`server/api/src/lib/sms.js`) is a separate, unrelated open item — see `SERVER.md` §6.1. It is the production path for SMS and is out of scope for the internal round.
