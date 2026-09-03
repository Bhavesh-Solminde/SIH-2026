# Flow Diagram Audit — Kabadiwala Connect

Comparing the uploaded diagram against the actual code in the app and server.

---

## Diagram vs Code — Section by Section

### 🟦 AUTHORISED RECYCLER / DISMANTLER (Top-left)

| Diagram Step | Code Status | Notes |
|---|---|---|
| Join Platform | ✅ Implemented | `POST /auth/login` in [`auth.js`](file:///Users/solminde/Developer/Personal/SIH(2026)/server/api/src/routes/auth.js) — magic-link email login for recyclers |
| MPCB authorisation data loaded | ✅ Implemented | `mpcb_recyclers.csv` seeded into DB; `authorizationStatus` field on `recycler` table |
| 161 Listed → 42 Currently Valid | ✅ Implemented | `/sync/bootstrap` filters `WHERE authorization_status = 'VALID'` — lapsed recyclers excluded from the phone's cache |
| Filtered Out (Not Shown) on app | ✅ Implemented | `sync.js` only sends `VALID` recyclers in bootstrap/delta responses |
| **Authorisation Valid?** YES/NO fork | ✅ Implemented | `requireSession` middleware checks `recycler.authorizationStatus`; only `VALID` recyclers can log in to the console |

---

### 🟩 PUBLISH RECYCLER DETAILS (Top-right)

| Diagram Step | Code Status | Notes |
|---|---|---|
| Publish Buying Rates (₹/kg) | ✅ Implemented | `POST /recycler/rates` in [`recycler.js`](file:///Users/solminde/Developer/Personal/SIH(2026)/server/api/src/routes/recycler.js) — console rates page |
| Accepted Materials | ✅ Implemented | `materialsAccepted` field stored and synced |
| Pickup Availability | ✅ Implemented | `pickupAvailable` boolean on recycler, shown in Value screen |
| Service Area | ✅ Implemented | `serviceAreaKm` used in haversine ranking |
| Recycler Data Available to Collector (rates, pickup, location, auth status) | ✅ Implemented | All 5 fields reach the phone via `/sync/bootstrap` → cached in local SQLite |

---

### 🟩 INFORMAL COLLECTOR / KABADIWALA (Middle)

| Diagram Step | Code Status | Notes |
|---|---|---|
| Open App — No Login / No Form | ✅ Implemented | App.js has no auth screen; collector is pseudonymous (UUID generated on first acceptance) |
| Browse E-Waste Categories (CRT, LCD, PCB, Cable, Battery, Motor, Mixed Plastic) | ✅ Implemented | [`CategoryScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/CategoryScreen.jsx) + [`SubCategoryScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/SubCategoryScreen.jsx) load from local cache |
| Enter Weight — Large Keypad + Voice Feedback | ✅ Implemented | [`QuantityScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/QuantityScreen.jsx) has numeric input; audio plays on entry |
| Collection Location + Time (1st Geotag + Timestamp) | ✅ Implemented | [`CameraScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/CameraScreen.jsx) captures GPS + timestamp; `collectionLat/collectionLng/collectionTs` passed through the whole flow |

> [!WARNING]
> **Camera → AI classification gap**: The diagram doesn't show a camera step explicitly in the main flow, but the app has `CameraScreen` (S1). **The `/detect` AI classification (suggested category from photo) is NOT yet wired into `CameraScreen`** — the camera captures photos but the category suggestion from the ML model is not called in the app. The photo is stored locally and synced, but the auto-classify step shown in the diagram isn't live yet.

---

### 🟧 OFFLINE PRICE ENGINE

| Diagram Step | Code Status | Notes |
|---|---|---|
| Cached Recycler Rates (Last Sync) | ✅ Implemented | [`reference.js`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/db/repos/reference.js) `loadReference(db)` reads local SQLite |
| Recycler Coordinates | ✅ Implemented | `lat/lng` cached per recycler in local DB |
| Weight × Published Rate (₹/kg) | ✅ Implemented | `estimatedValue()` from `@bhaav/core/pricing` |
| Estimated Value at Nearby Authorised Recyclers | ✅ Implemented | [`ValueScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/ValueScreen.jsx) — instant, fully offline |

---

### 🟪 SMART RECYCLER RECOMMENDATION

| Diagram Step | Code Status | Notes |
|---|---|---|
| Rate | ✅ Implemented | `rankRecyclers()` in `@bhaav/core/ranking` includes rate score |
| Distance | ✅ Implemented | Haversine from collection GPS to recycler lat/lng |
| Material Accepted | ✅ Implemented | `materialsAccepted` filtered in ranking |
| Pickup Availability | ✅ Implemented | `pickupAvailable` shown in recycler row |
| Current Authorisation | ✅ Implemented | Only `VALID` recyclers reach the phone |
| Recycler Ranking | ✅ Implemented | `rankRecyclers()` composite score (rate + distance) |
| ⭐ Recommended Recycler (Top) | ✅ Implemented | `ValueScreen` marks `index === 0` with star badge "सुचवलेले" |
| Re-sortable by value / distance | ✅ Implemented | `SORT_MODES: ['score', 'value', 'distance']` toggle in ValueScreen |
| Collector Selects Recycler | ✅ Implemented | Tap → navigate to AcceptScreen |

---

### 🟥 RECYCLER NOTIFICATION & ACCEPTANCE

| Diagram Step | Code Status | Notes |
|---|---|---|
| Selection Stored in Local Queue | ✅ Implemented | `createAcceptance()` writes to local DB + outbox in one transaction |
| Recycler Notification | ✅ Implemented | Acceptance syncs via `/sync/push`; visible in console `GET /recycler/acceptances` |
| Recycler May: Decline / Do Nothing | ✅ Implemented | `POST /recycler/acceptances/:id/respond` — ACCEPT or REJECT; NONE = do nothing |
| Heads-up, NOT Permission | ✅ Implemented | AcceptScreen shows "तुम्ही आत्ता जाऊ शकता" + "स्वीकृती म्हणजे परवानगी नाही" |
| Collector May Plan Visit | ✅ Implemented | Flow continues immediately after acceptance regardless of recycler response |

---

### 🟥 DIGITAL HANDOVER RECORD

| Diagram Step | Code Status | Notes |
|---|---|---|
| Physical Inspection (True Grade, Opened/Stripped) | ✅ Implemented | `POST /handover` — recycler submits `inspected_condition` + optional `downgrade_reason_code` |
| Category, Weight, Agreed Rate, Total Amount, Unique Reference | ✅ Implemented | All stored in `handover` table; `referenceCode` derived from lot UUID on-device |
| Collection Location + Timestamp | ✅ Implemented | `collectionLat/Lng/collectionTs` on lot row |
| **2nd Geotag + Timestamp** (Handover Location) | ✅ Implemented | `handoverLat/Lng/handoverTs` on handover row |
| Collector Counter-signs | ✅ Implemented | [`HandoverScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/HandoverScreen.jsx) — ✅ बरोबर / ❌ चूक buttons |
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

| Diagram Step | Code Status | Notes |
|---|---|---|
| Estimate ≠ Actual repeatedly | ✅ Implemented | ML detector via `callPredict()` in [`handover.js`](file:///Users/solminde/Developer/Personal/SIH(2026)/server/api/src/routes/handover.js) fires on every handover |
| Abnormal Weight | ✅ Implemented | `buildDetectPayload()` feeds transaction history to detector; quantity anomaly is a detector |
| Identical Location + Time pattern | ✅ Implemented | Pattern-based detectors in `/detect` endpoint |
| Other Abnormal/Inconsistent Values | ✅ Implemented | `ML_PRICE_ANOMALY` flag with `score`, `risk_level`, `features` |
| Anomaly Identified → Flag | ✅ Implemented | `prisma.anomalyFlag.create()` — WARN or CRITICAL severity |
| Pattern-based, not single-transaction | ✅ Implemented | `buildDetectPayload` builds full history context, not just current record |

> [!NOTE]
> The diagram says "pattern-based, not single-transaction based" — this is correctly implemented. The `/detect` route (`POST /detect`) sends the full history payload to the ML service. However the **handover-level ML check** (`callPredict`) is a single-transaction check that runs on every handover close, which is additive (not contradictory) to the pattern detector.

---

### 🟩 EVERY CLOSED LOT BUILDS

| Diagram Step | Code Status | Notes |
|---|---|---|
| Collector Earnings Ledger | ✅ Implemented | [`LedgerScreen.jsx`](file:///Users/solminde/Developer/Personal/SIH(2026)/client/app/src/screens/LedgerScreen.jsx) — week + month totals from local DB |
| E-Waste Traceability | ✅ Implemented | Full chain: collector → lot → acceptance → handover, all linked by UUID |
| Observed Price Dataset | ✅ Implemented | 3-price record per lot: estimate, published rate, actual paid |
| Classifier Training Data | ⚠️ Partial | Photos are captured and stored; `photo` table exists; but **upload pipeline (`POST /photos/upload`) is not wired to an actual training pipeline yet** |

---

## Summary Table

| Diagram Section | ✅ Working | ⚠️ Partial / Stubbed | ❌ Missing |
|---|---|---|---|
| Recycler join + MPCB auth | ✅ | | |
| Rate publishing | ✅ | | |
| App — no login | ✅ | | |
| Category browsing | ✅ | | |
| Quantity + voice feedback | ✅ | | |
| Collection geotag + timestamp | ✅ | | |
| **Camera → AI category suggestion** | | ⚠️ Camera works, AI classify not wired in app | |
| Offline price engine | ✅ | | |
| Smart recycler ranking | ✅ | | |
| Acceptance + notification | ✅ | | |
| Heads-up not permission | ✅ | | |
| Physical inspection / handover | ✅ | | |
| Collector counter-sign | ✅ | | |
| 2nd geotag + timestamp | ✅ | | |
| 3-price record | ✅ | | |
| Anomaly detection (pattern) | ✅ | | |
| Anomaly detection (per-handover ML) | ✅ | | |
| Earnings ledger | ✅ | | |
| E-waste traceability | ✅ | | |
| Classifier training data pipeline | | ⚠️ Photos stored, not yet piped to training | |

---

## 2 Gaps vs the Diagram

### Gap 1 — Camera → AI category suggestion not wired in app
The diagram implies camera → category is suggested (possibly by AI). `CameraScreen` captures photos but does **not call `/detect`** or any ML route to suggest a category. The collector manually picks category on the next screen. The `/detect` route exists on the server but it's a recycler-session route for anomaly detection, not a category classifier for the collector.

### Gap 2 — Photo upload → training pipeline
The diagram's "Classifier Training Data" box implies photos contribute to a training loop. Photos are stored in the `photo` table and `POST /photos/upload` exists, but there's no pipeline connecting uploaded photos to a training dataset or label store.

Everything else in the diagram is **accurately reflected** in the running code.
