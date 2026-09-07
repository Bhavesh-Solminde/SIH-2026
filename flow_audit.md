# Flow Diagram Audit — Kabadiwala Connect

Comparing the uploaded diagram against the actual code in the app and server. **Regenerated 2026-09-06** against `git log --oneline f11d8fd..HEAD` — every row below was re-checked against the current source, not carried over from the previous audit.

---

## Diagram vs Code — Section by Section

### 🟦 AUTHORISED RECYCLER / DISMANTLER (Top-left)

| Diagram Step | Code Status | Notes |
|---|---|---|
| Join Platform | ✅ Implemented | `POST /auth/login` in [`auth.js`](file:///Users/solminde/Developer/Personal/SIH(2026)/server/api/src/routes/auth.js) — **email + password**, session cookie (`bhaav_session`), 7-day TTL. **Corrected from the previous audit**, which called this "magic-link email login" — there is no magic link anywhere in the codebase |
| MPCB authorisation data loaded | ✅ Implemented | `mpcb_recyclers.csv` seeded into DB; `authorization_status` field on `recycler` table |
| 161 Listed → 74 Currently Valid | ✅ Implemented | `/sync/bootstrap` filters `WHERE authorization_status = 'VALID'` — lapsed recyclers excluded from the phone's cache. **Corrected from the previous audit's "42 Currently Valid"** — every other document in this repo (`README.md`, `SERVER.md`, `DB.md`) says 74, and `GET /public/authorisation` computes this count live from the same table |
| Filtered Out (Not Shown) on app | ✅ Implemented | `sync.js` only sends `VALID` recyclers in bootstrap/delta responses |
| **Authorisation Valid?** YES/NO fork | ⚠️ **Corrected — was wrong in the previous audit.** `requireSession` (`server/api/src/middleware/requireSession.js`) checks only that the session cookie is present and unexpired; it does **not** read `authorizationStatus` at all. A recycler whose listing has lapsed can still log in to the console and publish rates — the `VALID` filter is enforced only where the app decides which recyclers to *show a collector*, not on console login |

---

### 🟩 PUBLISH RECYCLER DETAILS (Top-right)

| Diagram Step | Code Status | Notes |
|---|---|---|
| Publish Buying Rates (₹/kg) | ✅ Implemented | `POST /recycler/rates` in [`recycler.js`](file:///Users/solminde/Developer/Personal/SIH(2026)/server/api/src/routes/recycler.js) — console rates page. Append-only, never an `UPDATE` |
| Accepted Materials | ✅ Implemented | `materialsAccepted` field stored and synced |
| Pickup Availability | ✅ Implemented | `pickupAvailable` boolean on recycler, shown in Value screen |
| Service Area | ✅ Implemented | `serviceAreaKm` used in haversine ranking |
| Recycler Data Available to Collector (rates, pickup, location, auth status) | ✅ Implemented | All 5 fields reach the phone via `/sync/bootstrap` → cached in local SQLite |
| **New since the last audit** — Authorisation-evidence panel | ✅ Implemented | `AuthorisationPanel` on the console's rates page and the app's `ValueScreen`, rendering live listed/valid/lapsed counts and the MPCB source's `fetchedOn` date from `GET /public/authorisation`, plus a per-row `RecyclerAuthBadge` on the app. See `FRONTEND.md` §2 (S5) and §4 (R1) |

---

### 🟩 INFORMAL COLLECTOR / KABADIWALA (Middle)

| Diagram Step | Code Status | Notes |
|---|---|---|
| Open App — No Login / No Form | ✅ Implemented | `App.js` has no auth screen; collector is pseudonymous (UUID generated on-device) |
| Browse E-Waste Categories (CRT, LCD, PCB, Cable, Battery, Motor, Mixed Plastic) | ✅ Implemented | [`CategoryScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/CategoryScreen.jsx) + [`SubCategoryScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/SubCategoryScreen.jsx) load from local cache |
| Enter Weight — Large Keypad + Voice Feedback | ✅ Implemented | [`QuantityScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/QuantityScreen.jsx) has numeric input; audio plays on entry |
| Collection Location + Time (1st Geotag + Timestamp) | ✅ Implemented | [`CameraScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/CameraScreen.jsx) captures GPS + timestamp; `collectionLat/collectionLng/collectionTs` passed through the whole flow |

> [!NOTE]
> **Camera → AI classification — re-audited, and the previous "gap" was a documentation error, not a missing feature.** `AI.md` §1 states the shipped decision plainly and by name: *"We do not ship a material-classification model. Categorisation is a human tap on an icon grid."* `CameraScreen.jsx` was re-checked directly (`grep` for `fetch`/`api.`/`classify`/`detect` in the file) and calls no endpoint at all — there is nothing there to wire up, because nothing was ever meant to call anything. The `/detect` route on the server is unrelated: it is the recycler-session anomaly-pattern endpoint (`callDetect`, D1–D13), not a photo classifier, and the collector app never calls it. **This was never a gap against the intended design — only against a diagram that implied a classification step the spec explicitly and deliberately rejects.** See `AI.md` §1 for the full "tap beats model" argument.

---

### 🟧 OFFLINE PRICE ENGINE

| Diagram Step | Code Status | Notes |
|---|---|---|
| Cached Recycler Rates (Last Sync) | ✅ Implemented | [`reference.js`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/db/repos/reference.js) `loadReference(db)` reads local SQLite |
| Recycler Coordinates | ✅ Implemented | `lat/lng` cached per recycler in local DB |
| Weight × Published Rate (₹/kg) | ✅ Implemented | `estimatedValue()` from `@bhaav/core/pricing`, using `conditionFactorFor()` — single-sourced as of `beffd6a`; `ranking.js` no longer carries its own hardcoded copy of the condition factors |
| Estimated Value at Nearby Authorised Recyclers | ✅ Implemented | [`ValueScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/ValueScreen.jsx) — instant, fully offline |

---

### 🟪 SMART RECYCLER RECOMMENDATION

| Diagram Step | Code Status | Notes |
|---|---|---|
| Rate | ✅ Implemented | `rankRecyclers()` in `@bhaav/core/ranking` — **the scoring changed since the last audit (`bf2060a`).** The old score maximised closeness between the recycler's rate and the collector's expected rate, which *penalised* a recycler for paying more than expected and could recommend one paying 43% less. The score is now value-dominant: `RANKING_WEIGHTS = { value: 0.55, distance: 0.30 (subtracted), pickup: 0.10 (added), staleness: 0.05 (subtracted) }` (`packages/core/src/constants.js`) |
| Distance | ✅ Implemented | Haversine from collection GPS to recycler lat/lng |
| Material Accepted | ✅ Implemented | `materialsAccepted` filtered in ranking |
| Pickup Availability | ✅ Implemented | `pickupAvailable` shown in recycler row |
| Current Authorisation | ✅ Implemented | Only `VALID` recyclers reach the phone |
| Recycler Ranking | ✅ Implemented | `rankRecyclers()` composite score (value − distance + pickup − staleness) |
| ⭐ Recommended Recycler (Top) | ✅ Implemented | `ValueScreen` marks `index === 0` with star badge "सुचवलेले" |
| Re-sortable by value / distance | ✅ Implemented | `SORT_MODES: ['score', 'value', 'distance']` toggle in ValueScreen |
| Collector Selects Recycler | ✅ Implemented | Tap → navigate to AcceptScreen |

---

### 🟥 RECYCLER NOTIFICATION & ACCEPTANCE

| Diagram Step | Code Status | Notes |
|---|---|---|
| Selection Stored in Local Queue | ✅ Implemented | `createAcceptance()` writes to local DB + outbox in one transaction |
| Recycler Notification | ✅ Implemented, and **stronger than at the last audit.** Visible in console `GET /recycler/acceptances`, **plus an actual SMS text** (Fast2SMS route `q`) fired on both the online `POST /public/lots` path and the offline `/sync/push` outbox-replay path (idempotent — replaying a synced batch does not re-text). Default off (`SMS_ENABLED`), plus `SMS_ALLOWLIST` and `SMS_DRY_RUN` — see `SERVER.md` §6.1 |
| Recycler May: Decline / Do Nothing | ✅ Implemented | `POST /recycler/acceptances/:id/respond` — `ACCEPT` or `REJECT`; `NONE` = do nothing |
| Heads-up, NOT Permission | ✅ Implemented | AcceptScreen shows "तुम्ही आत्ता जाऊ शकता" + "स्वीकृती म्हणजे परवानगी नाही" |
| Collector May Plan Visit | ✅ Implemented | Flow continues immediately after acceptance regardless of recycler response |
| **New since the last audit** — Collector notified on accept/decline | ✅ Implemented, opt-in only | If a `collector_contact` row exists (`DB.md` §3.1a — separate table, never a column on `collector`), an SMS fires on `POST /recycler/acceptances/:id/respond`. No row, no message, no behaviour change — the collector stays phone-free by default |

---

### 🟥 DIGITAL HANDOVER RECORD

| Diagram Step | Code Status | Notes |
|---|---|---|
| Physical Inspection (True Grade, Opened/Stripped) | ✅ Implemented | `POST /handover` — recycler submits `inspected_condition` + optional `downgrade_reason_code` |
| Category, Weight, Agreed Rate, Total Amount, Unique Reference | ✅ Implemented | All stored in `handover` table; `referenceCode` derived from lot UUID on-device |
| Collection Location + Timestamp | ✅ Implemented | `collectionLat/Lng/collectionTs` on lot row |
| **2nd Geotag + Timestamp** (Handover Location) | ✅ Implemented | `handoverLat/Lng/handoverTs` on handover row |
| Collector Counter-signs | ✅ Implemented | [`HandoverScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/HandoverScreen.jsx) — ✅ बरोबर / ❌ चूक buttons, plus a QR scanner now wired in on the console side (`QrScanner.jsx`, `a468a4d`) with the manual reference-code entry preserved and always visible, never hidden behind a scanner failure |
| Recycler Counter-signs | ✅ Implemented | `recyclerConfirmedAt` set when recycler creates the handover row |
| HANDOVER CONFIRMED | ✅ Implemented | Status → `CONFIRMED` on `POST /handover/:lot_id/confirm`; or locally via `confirmHandover()` |

---

### 🟦 3-PRICE RECORD

| Diagram Step | Code Status | Notes |
|---|---|---|
| Collector Estimate | ✅ Implemented | `estimatedValue` on the `lot` row |
| Recycler Published Rate | ✅ Implemented | `acceptedRate` on the `acceptance` row |
| Actual Amount Paid | ✅ Implemented | `finalTotal` on the `handover` row |

---

### 🟧 PATTERN-BASED ANOMALY DETECTION

**Corrected from the previous audit, which conflated two separate mechanisms.** There are genuinely two ML/rule integrations on the handover path, calling two different services:

1. **Single-transaction check** — `scoreHandover()` in `handover.js`, fired fire-and-forget at `POST /handover` (the recycler's submission). Calls `callPredict()` → the deployed model at `sihmodel.vercel.app` (`AIML_PREDICT_URL`). On an anomaly it writes one `anomaly_flag` row with `detector_code = "ML_PRICE_ANOMALY"`. **The payload was degenerate until today** (`121e11c`): `reference_price` and `buyer_offer_per_kg` were the same number, pinning two of the model's five features at constants. Fixed — `reference_price` is now the median published rate among other `VALID` recyclers in the category.
2. **Pattern-based detectors** — `runDetection()` in `detectRun.js`, fired fire-and-forget at `POST /handover/:lot_id/confirm` (the collector's counter-signature). Calls `callDetect()` → `server/aiml` (`AIML_DETECT_URL`), the eleven in-scope threshold detectors (`AI.md` §5, `IN_SCOPE` in `config.py`).

Both are genuinely fail-open and un-awaited: a third-party outage delays neither the recycler's submission nor the collector's confirmation.

| Diagram Step | Code Status | Notes |
|---|---|---|
| Estimate ≠ Actual repeatedly | ✅ Implemented | D2 (systematic underpayment) in the pattern-detector set |
| Abnormal Weight | ⚠️ **Correction: not implemented.** D4 (weight outlier) is registered but **permanently skips** — it is blocked on real per-category weight distributions that do not exist, and is explicitly out of scope for this build (`AI.md` §5, §7). No detector currently flags an abnormal weight |
| Identical Location + Time pattern | ✅ Implemented | D6 (duplicate lot), D8 (clustered handovers) in `server/aiml/bhaav_aiml/detectors/provenance.py` |
| Other Abnormal/Inconsistent Values | ✅ Implemented | `ML_PRICE_ANOMALY` flag (single-transaction, see above) with `score`, `risk_level`, `features`; plus D1, D3, D9–D13 (pattern-based) |
| Anomaly Identified → Flag | ✅ Implemented | `prisma.anomalyFlag.create()` — `INFO`/`WARN`/`CRITICAL` (`MARKET` finding for D13, no severity escalation beyond `WARN`) |
| Pattern-based, not single-transaction | ✅ Implemented for the eleven `server/aiml` detectors | `buildDetectPayload()` builds full history context, not just current record. The `ML_PRICE_ANOMALY` check above is genuinely single-transaction and additive, exactly as the previous audit noted — that part was correct |
| **New since the last audit** — detection actually fires | ✅ Implemented | Before today the eleven pattern detectors were reachable only via `POST /detect-run`, an authenticated route nothing called — in a deployed configuration they had never fired. They now fire automatically after every confirmed handover, plus an operator "Run detection" button on the console's flags page |
| **New since the last audit** — alert-budget enforcement | ✅ Implemented | D1 alone fires on roughly a third of handovers against a stated 5% alert budget. `GET /recycler/flags` excludes `INFO` severity by default; `?includeInfo=1` returns all. The budget is enforced at the presentation boundary, not by raising D1's threshold |
| **New since the last audit** — evaluation harness | ✅ Implemented | `bhaav_aiml/evaluate.py` — recall, precision, alert-rate, and a flag-everyone baseline, run against the simulator's adversarial recycler archetypes. Recall 1.0 and precision 1.0 on the three planted bad actors (`systematic_liar`, `late_onset_liar`, `monopolist`) |

---

### 🟩 EVERY CLOSED LOT BUILDS

| Diagram Step | Code Status | Notes |
|---|---|---|
| Collector Earnings Ledger | ✅ Implemented | [`LedgerScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/LedgerScreen.jsx) — week + month totals from local DB |
| E-Waste Traceability | ✅ Implemented | Full chain: collector → lot → acceptance → handover, all linked by UUID |
| Observed Price Dataset | ✅ Implemented | 3-price record per lot: estimate, published rate, actual paid |
| Classifier Training Data | ⚠️ Partial, unchanged since the last audit | Photos are captured and stored; `photo` table exists; **upload pipeline (`POST /photos/upload`) is not wired to any training pipeline** — see Gap 2 below. This matches `FLOW.md`'s own framing ("accumulating, not yet trained on") — it is a stated roadmap item, not a silent omission |

---

## Summary Table

| Diagram Section | ✅ Working | ⚠️ Partial / Corrected | ❌ Missing |
|---|---|---|---|
| Recycler join + MPCB auth | ✅ | ⚠️ auth method and valid-count corrected; console login does not gate on authorisation status | |
| Rate publishing | ✅ | | |
| Authorisation-evidence panel *(new)* | ✅ | | |
| App — no login | ✅ | | |
| Category browsing | ✅ | | |
| Quantity + voice feedback | ✅ | | |
| Collection geotag + timestamp | ✅ | | |
| **Camera → AI category suggestion** | ✅ *(by deliberate design, not a gap)* | | |
| Offline price engine | ✅ | | |
| Smart recycler ranking | ✅ | ⚠️ scoring formula changed (`bf2060a`) | |
| Acceptance + notification | ✅ | | |
| SMS on acceptance / accept / decline *(new)* | ✅ | | |
| Heads-up not permission | ✅ | | |
| Physical inspection / handover | ✅ | | |
| QR scanning at handover *(new)* | ✅ | | |
| Collector counter-sign | ✅ | | |
| 2nd geotag + timestamp | ✅ | | |
| 3-price record | ✅ | | |
| Anomaly detection (per-handover ML) | ✅ | | |
| Anomaly detection (pattern, D1–D13) | ✅ | | |
| Anomaly detection — fires automatically *(new)* | ✅ | | |
| Weight-outlier detection (D4) | | | ❌ permanently out of scope |
| Earnings ledger | ✅ | | |
| E-waste traceability | ✅ | | |
| Classifier training data pipeline | | ⚠️ Photos stored, not yet piped to training (stated roadmap item) | |
| Critical Mineral Ledger | | | ❌ deliberately held, not built |
| D14 (Hazard Gap / evidence-photo reuse) | | | ❌ deliberately held, not built |

---

## Gaps vs the Diagram

### Gap 1 — Photo upload → training pipeline (unchanged from the last audit)

The diagram's "Classifier Training Data" box implies photos contribute to a training loop. Photos are stored in the `photo` table and `POST /photos/upload` exists, but there is no pipeline connecting uploaded photos to a training dataset or label store. This is a stated, deliberate roadmap item (`FLOW.md` §"What the system accumulates", `AI.md` §3.1) — it is not a silent gap, and the reason it is not built yet (no dataset of Indian informal-scrap imagery exists) is argued explicitly in `AI.md` §1.

### Gap 2 — Weight-outlier detection (D4) is not built, and never will be for this build

D4 is registered in the detector code but permanently skips: it is blocked on real per-category weight distributions that do not exist (`README.md` open item 7), and `AI.md` §5/§7 name it out of scope. No document should claim it fires.

### Not a gap — Camera → AI category suggestion

Re-audited this run. The previous audit's "Gap 1" treated the absence of an auto-classify step as a missing feature. It is not: `AI.md` §1 argues for the icon-tap explicitly and by name, and the code matches the argument exactly (`CameraScreen.jsx` calls no classification endpoint, and none exists for it to call). Kept out of the gaps list on purpose so this document does not keep re-flagging a decision that was made deliberately.

### Also corrected this pass (not diagram gaps, but false claims in the previous audit)

- Login is email + password, not a magic link (`auth.js`).
- The MPCB valid-recycler count is 74, not 42 — every other document in the repo already said 74; this file was the outlier.
- `requireSession` does not check `authorizationStatus`. A recycler whose MPCB listing has lapsed can still log in to the console; only the collector-facing recommendation list is filtered to `VALID`.

Everything else in the diagram is **accurately reflected** in the running code.
