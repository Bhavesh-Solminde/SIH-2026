# Frontend Specification — SIH26229

**Problem statement:** SIH26229, Kabadiwala Connect — Bringing the Informal Collector into the Formal Recycling Chain
**Sponsor:** Ministry of Mines / JNARDDC, Nagpur
**Working product name:** Bhaav *(the PS title stays on the submission form; the product is named separately — "Kabadiwalla Connect" is a real Chennai enterprise since 2014)*

Two applications:

| App | Users | Platform | Network |
|---|---|---|---|
| **Collector app** | Informal collectors — cart-based, or a small unregistered shop | Android, entry-level device, small APK | **Fully offline.** Every screen works at zero bars |
| **Recycler console** | MPCB/CPCB-authorised recyclers and dismantlers | Web, desktop or tablet | Online. Runs at a facility with connectivity |

---

## 1. Design principles for the collector app

These are non-negotiable and each maps to a line in the brief.

1. **No free text anywhere in the collector flow.** Every input is a tap, a number, or a voice prompt.
2. **Icons carry meaning, words support them.** Large symbols with Marathi/Hindi labels beneath, never labels alone.
3. **Every number is spoken.** Weight entered, value shown, rate offered — all read aloud in the chosen language.
4. **No login, no account, no form on first open.** The app opens on one button.
5. **The UI never waits for the network.** If a screen can show a spinner tied to connectivity, it is built wrong.
6. **Maximum three taps per step.** One-handed operation, large targets (min 56dp), high contrast.
7. **Colour never carries meaning alone** — every status has an icon and a word.
8. **Cash is the default.** Digital payment is optional and never a precondition.

**Languages:** Marathi and Hindi at minimum (brief requirement). Language is chosen once on first open, changeable from the ledger screen. All strings and all audio ship inside the APK — no runtime translation service.

---

## 2. Collector app — screen by screen

### S0 · Home

One full-width primary button: **नवीन लॉट** (New lot). Below it, two small tiles: **आजची कमाई** (today's earnings) and **भाव** (price board).

Nothing else. No dashboard, no cards, no menu.

- Header shows a sync pill: `✓ अद्ययावत` (synced) or `⟳ ३ बाकी` (3 pending). Tap for detail.
- If the local rate table is older than 3 days, a muted strip: `भाव: २ सप्टेंबर` with the date greyed.

### S1 · Photograph the material

Full-screen camera, one shutter button, a torch toggle.

- The photo is **captured for the record first**, identification second. It is compressed to ~200 KB and written to local storage before anything else happens.
- Multiple photos allowed (max 4), thumbnail strip at the bottom.
- **Collection location and timestamp are captured here** — this is the first of the two geotags the record will carry. GPS is satellite, so it works with no network.
- If GPS is unavailable, allow the collector to pick their operating area from a short list. Never block.

### S2 · Category — the icon grid

A 2×4 grid of large drawn symbols. This is the primary and only required classification input.

| Category | Symbol | Marathi | Hindi | Default unit |
|---|---|---|---|---|
| Cables / wire | Coiled wire | तार | तार | kg |
| PCB / circuit board | Board with traces | सर्किट बोर्ड | सर्किट बोर्ड | kg |
| LCD / LED panel | Flat screen | स्क्रीन | स्क्रीन | piece |
| CRT | Bulbous monitor | जुना टीव्ही | पुराना टीवी | piece |
| Battery | Cell with + / − | बॅटरी | बैटरी | kg |
| Motor / magnet assembly | Motor with shaft | मोटर | मोटर | kg |
| Mixed plastic | Housing shell | प्लास्टिक | प्लास्टिक | kg |
| Other / mixed | Question mark | इतर | अन्य | kg |

- **Tapping any icon speaks its name aloud.** Tap once to hear, tap the confirm arrow to select — or long-press to select directly.
- Icons must be drawn line art, not photographs and never emoji. They must be recognisable at 96dp on a low-DPI screen.

### S3 · Sub-category — the clarifying question *(conditional)*

Shown only for the four categories where the sub-type sets the price and no photograph can settle it. **Two large pictures, one question, spoken aloud.**

| Parent | Question | Option A | Option B |
|---|---|---|---|
| PCB | *"कोणता बोर्ड?"* | Computer / laptop board | TV / appliance board |
| Battery | *"कोणती बॅटरी?"* | Phone / laptop (flat, light) | Inverter / UPS (heavy, black) |
| Panel | *"कोणती स्क्रीन?"* | Laptop / monitor | Television |
| Motor | *"कोणता भाग?"* | Hard disk | Fan / pump motor |

A **"मला माहीत नाही"** (I don't know) option is always present and routes to the lower-value sub-category, so uncertainty never inflates the estimate.

### S4 · Quantity

Unit toggle first — **किलो / नग** (kg / pieces) — defaulting to the category's default unit.

Then a large numeric keypad. The entered number is **spoken back** after each change. Decimal allowed for kg, integers only for pieces.

### S4b · Condition — three buttons

**Required, one tap, no skip.** Three full-width buttons with a drawn pictogram and a word, spoken aloud on tap:

| Value | Marathi | Hindi | Pictogram |
|---|---|---|---|
| `GOOD` | चांगली | अच्छी | Intact outline |
| `FAIR` | ठीक | ठीक | Outline with a scratch |
| `POOR` | खराब | खराब | Cracked outline |

Colour supports the pictogram, never replaces it — the word and the shape both carry the meaning.

Condition adjusts the estimate through a documented multiplier (`condition_factor` in `DB.md`, default 1.0 / 0.85 / 0.70) and is printed on the handover record, so both parties saw the same declaration before the price was agreed. It also feeds detector D5: a lot declared `POOR` that fetches a `GOOD` price is a signal worth a flag.

> These multipliers are **stated assumptions, not measurements.** They live in a table so the first field visit can replace them.

### S4c · Where it came from *(optional, skippable)*

One row of small chips — **घर** (household) · **दुकान** (shop) · **ऑफिस** (office) · **संस्था** (institutional) · **रस्ता** (street) · **इतर** (other) — with a **वगळा** (skip) action always visible.

Analytical only. It shows where material actually originates, which is genuinely interesting to the ministry, and it is **never allowed to slow the collector down.** If it is not tapped within a moment, the collector moves on and the field stays null.

### S5 · Value and recyclers — the thesis screen

The single most important screen in the app. It appears **instantly and offline**, computed from the rate table cached at last sync.

**Top block:** the estimated value, very large, spoken aloud on arrival.
`₹ १,२६०` with `३ किलो × ₹४२०/किलो` beneath, and an **अंदाजे** (estimated) chip — the value is explicitly non-binding.

**Below:** a ranked list of authorised recyclers. One row each:

```
शक्ती रीसायकलर्स        ₹ १,२९०
४.२ किमी · अधिकृत · तार घेतात · पिकअप उपलब्ध
```

Each row shows: name, value at *their* rate, distance, an **authorised** badge, whether they accept this material, and pickup availability.

- **Ranked on rate and distance together, not proximity.** The recommended row carries a marker and the words **सुचवलेले** (recommended).
- **Only recyclers with a currently valid authorisation appear.** Of the 161 entries on the MPCB published list, **87 have lapsed and only 74 are current** — the app never routes a collector to a lapsed one.
- A muted footer states the rate date: `भाव: २ सप्टेंबर`.

### S6 · Accept

Tap a row → confirmation sheet with the name, the value and the distance → **स्वीकारा** (accept).

On accept:
- The lot is written locally with `status = accepted`.
- The acceptance is queued in the outbox.
- The screen states plainly: *"स्वीकारले. [Recycler] ला कळवले जाईल."* — accepted, will be sent to the recycler — with a pending badge if offline.
- **A line the collector must see: "तुम्ही आत्ता जाऊ शकता."** You can go now. The acceptance is a heads-up, never a permission.

### S7 · Handover

Opened at the facility, by either party.

**Collector side:** a large QR encoding the lot reference. Below it, the lot summary.

**After the recycler scans and enters the final price**, the collector sees a confirmation screen showing **the amount to be recorded**, spoken aloud, with two buttons: **बरोबर** (correct) and **चूक** (wrong).

> This two-sided confirmation is deliberate. The recycler cannot record an amount the collector did not agree to, and the collector cannot dispute an amount they confirmed.

On confirmation the handover record is finalised with the **second location and timestamp** — where and when the material actually changed hands — and a unique reference code. A printable/shareable slip is generated.

### S8 · Earnings ledger

A simple reverse-chronological list: date, category icon, weight, amount, and a status chip — **मिळाले** (received) / **बाकी** (pending).

Header totals for this week and this month. Nothing more; no charts, no analytics.

### Price board *(standalone, reachable from S0)*

A plain table of current rates per category, with the date. A speaker button reads the whole board aloud in sequence — this is the feature for a collector who wants to know the rates before buying from a household.

### Safety guidance *(standalone)*

Pictorial cards with audio, per the brief: do not burn cables, do not open batteries, handle CRTs carefully, do not use acid on boards. Six cards, images plus one spoken sentence each. No text-only content.

---

## 3. Offline behaviour in the UI

| Situation | What the collector sees |
|---|---|
| No network, any screen | Nothing different. No banners, no blocking, no spinners |
| Pending items in outbox | `⟳ ३ बाकी` pill in the header |
| Rate table older than 3 days | Rate date shown greyed on S5 and the price board |
| Rate table older than 14 days | Amber strip: *"भाव जुने आहेत"* — rates are old. Values still shown |
| Accepted while offline | Pending badge + *"तुम्ही आत्ता जाऊ शकता"* |
| Handover completed offline | Record finalises normally. Syncs later. No warning |

**Rule:** offline is the normal case, not an error state. Never render it as a failure.

---

## 4. Recycler console

Web, desktop or tablet, English + Marathi. Assumes connectivity.

### R1 · Rates

The console's primary screen. A table of material categories with an editable rate and unit per row, and a **Publish** action.

- Rate changes are **append-only** — a new row with a timestamp, never an overwrite. The history is the price dataset.
- Shows when each rate was last updated, and flags any rate untouched for over 7 days.
- A "copy yesterday's rates" action, because most days nothing changes.

### R2 · Incoming acceptances

A live list of collectors who have accepted this recycler's rate: category, quantity, estimated value, distance, time accepted, collector's pseudonymous ID.

Two actions per row: **Acknowledge** and **Decline**. Neither is required — **doing nothing means the collector arrives as planned**, and the UI says so explicitly so a recycler does not think inaction cancels anything.

### R3 · Verify and counter-sign

Scan the QR (or type the reference). The console shows the lot: photographs, declared category, declared weight, the rate accepted.

The recycler enters the **actual weight after inspection** and the **final price**, then submits. This pushes a confirmation request to the collector's device (S7). The record closes only when **both** parties have confirmed.

### R4 · Lot history

All completed handovers, filterable by date and category, with CSV export. Each row shows the three prices: estimated, published-at-acceptance, final paid.

### R5 · Flags

Anomalies raised against this recycler's own transactions, with the reason stated in plain language. Visible to the recycler by design — the system is not covert.

---

## 5. Component inventory

Build these once, reuse everywhere:

- `CategoryIcon` — drawn SVG, three sizes, speaks its label on tap
- `SpokenValue` — renders a number and plays its audio in the active language
- `Meter` / `RankRow` — recycler row with rate, distance, badges
- `StatusChip` — icon + word + colour, never colour alone
- `PendingPill` — outbox count in the header
- `StalenessStrip` — rate date warning
- `NumericKeypad` — large, unit-aware, speaks on change
- `PhotoStrip` — up to 4 thumbnails
- `QRPanel` — generate and scan
- `ConfirmSheet` — the two-button confirm used at accept and at handover

---

## 6. Accessibility

- Minimum touch target 56dp; primary actions 72dp
- Text contrast ≥ 4.5:1 in both light and dark
- Every icon has a spoken label and a content description
- Full flow completable one-handed on a 5-inch screen
- Respects system font scaling up to 200% without clipping
- `prefers-reduced-motion` honoured; no animation is load-bearing
- No audio is mandatory — every spoken cue has a visible equivalent

---

## 7. Explicitly not built

User accounts and passwords · UPI or payments · push notification service · admin dashboard · in-app chat or messaging · ratings and reviews · route optimisation · map tiles or a visual map · multi-city onboarding · bidding or auctions.

A **list sorted by distance is sufficient**; a visual map needs cached tiles and buys nothing at the internal round.

---

## 8. Build order

1. S0 → S1 → S2 → S4 → S5 (local data, no sync) — this is the demo spine
2. S7 handover + QR + two-sided confirm
3. R1 rates + R3 counter-sign
4. S6 accept + outbox + R2
5. S8 ledger
6. Price board, safety cards
7. S3 clarifying questions
8. Staleness and pending indicators

If time runs out, **stop after 3.** A short loop that closes beats a long flow that stalls.
