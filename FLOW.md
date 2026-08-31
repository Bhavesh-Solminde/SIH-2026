# The flow, explained from zero — SIH26229

**Problem statement:** SIH26229, Kabadiwala Connect (Ministry of Mines / JNARDDC)
**Companion documents:** `FRONTEND.md`, `SERVER.md`, `AI.md`

Written for someone who has read the problem statement but has never seen our solution.

---

## Who is on the platform

Two sides. On one side, **authorised recyclers and dismantlers** — the MPCB/CPCB-registered facilities legally permitted to process e-waste. On the other, **informal collectors** — the kabadiwala with a cart or a small unregistered shop, working in cash, who handles the overwhelming majority of India's e-waste and today sells it to whoever is nearest.

Right now these two sides transact — when they transact at all — with no information and no paper.

---

## Before anything happens: the recycler sets up

A recycler joins and publishes **what they pay for each material category**, updating it as the market moves. Rates can be per kilogram or per piece, because CRTs, panels and whole appliances genuinely trade by the unit. They also state which materials they accept, whether they offer pickup, and their service area.

Their authorisation details are already in the system, loaded from MPCB's published list — and the app **only ever shows recyclers whose authorisation is currently valid.** Of the 161 entries on the public list, **87 show a lapsed authorisation date and only 74 are current** — so this filtering is doing real work from day one.

Rates are never overwritten. Each change is a new dated row, so the price history accumulates from the first day the platform runs.

---

## The collector has a pile to sell

They open the app. There is no login, no form — one button.

**They photograph the material.** The photograph's job is the record: it is evidence of what physically existed, and it is written to local storage before anything else happens. Nothing about the flow waits on it being understood by a machine.

**Then the collector classifies it themselves.** A grid of eight large drawn symbols — cable, circuit board, panel, CRT, battery, motor, plastic, other. Tapping one speaks its name aloud in Marathi or Hindi. One tap, no typing, no reading required.

**This is a deliberate decision, not a shortcut.** The collector is holding the material. Their answer is right essentially every time; an image model trained on borrowed, non-Indian data would be right perhaps 85% of the time, would need good light, and would be wrong in exactly the cases that matter most. We do not put a model where a tap is faster and more accurate.

**For four categories, the app asks one more question** — two large pictures, spoken aloud. *Computer board or appliance board? Phone battery or inverter battery? Laptop screen or television? Hard disk or fan motor?* These are the distinctions that set the price, and **no photograph could ever resolve them** — the difference is inside the object or in its grade, not on its surface. So they are always asked, never inferred. An "I don't know" option is always present and routes to the lower-value sub-type, so uncertainty never inflates the estimate.

**The collector enters the quantity** — kilograms or pieces, chosen by a toggle that defaults to whatever is normal for that category. Large keypad, value spoken back aloud.

**Then condition — good, fair or poor.** Three buttons, one tap, spoken aloud. This is not decoration: the brief names `condition` as a required field of the Material Dataset, it adjusts the estimate through a stated multiplier, and it is printed on the handover record so both parties saw the same declaration before agreeing a price. A lot declared poor that later fetches a good price is exactly the kind of inconsistency the detectors look for.

An optional row of chips asks where the material came from — household, shop, office, institution, street. Skippable, and never allowed to slow the collector down.

**At this moment the app also records where and when** — the collection location and time, the first of the two geotags and timestamps the record will carry.

---

## The app prices it, everywhere at once

The collector presses enter and the app **immediately calculates what this lot is worth at every nearby authorised recycler's published rate.** All of it happens on the phone, with no network, because the rates were cached at the last sync and the recyclers' coordinates ship inside the app.

**This is the first computed feature — recycler matching.** The app ranks recyclers on a combination of rate, distance, materials accepted, pickup availability and current authorisation status. It doesn't just show the closest one, because a recycler six kilometres further away paying forty rupees more per kilo is often the better trip — and that trade-off is precisely the calculation this person has never been able to make.

It is a weighted score, not a black box, and the collector can re-sort by pure distance or pure value. An opaque recommendation given to a low-literacy user would be a bad product no matter how accurate.

They see the whole list at once: **₹1,290 · 6.2 km · authorised · accepts PCB** — and one recommendation at the top.

---

## They choose, and the recycler is told

The collector taps accept on one. That recycler gets a notification that a collector has accepted their rate.

The recycler can decline. **If they do nothing, the collector simply travels as planned** — the acceptance is a heads-up, not a permission. This is what keeps the collector moving at the speed of the informal trade rather than waiting on a message, and it's what allows the whole flow to work offline: the acceptance sits in a queue on the phone and is delivered whenever connectivity returns.

---

## At the facility

The material is physically inspected and the two settle a final price. This is where anything a photograph could never reveal gets resolved — the true grade of a mixed board lot, a device that has been opened and stripped.

Then the **handover record** is generated: photograph, category, weight, agreed rate, total, unique reference, and the **second location and timestamp** — where and when the material actually changed hands.

**Both parties confirm it.** The recycler counter-signs, and so does the collector, so neither side can record an amount the other did not agree to. In the database a handover is simply not valid until both confirmations exist — it is a constraint, not a convention.

---

## Three prices, and the AI/ML feature

Every lot now carries three figures: **the estimate the collector saw, the rate the recycler had published, and the amount actually paid.**

**That is where anomaly detection lives** — and it is where our AI/ML effort goes, because it is the one place a machine sees something no human participant can.

Not on any single transaction. One gap between quoted and paid is just a negotiation after inspection. **The signal is in the pattern:** a recycler who consistently publishes one rate and pays a much lower one; a recycler whose advertised rate spikes to win the ranking and drops back within days; a weight far outside the normal range for its category, which is what a gutted device looks like in data; the same lot appearing twice within minutes; a collection and a handover so far apart in space and so close in time that the journey was impossible; fifty handovers logged at identical coordinates within the same minute.

The problem statement asks for exactly this — *"identification of abnormal or inconsistent transaction values"* — and the three-price structure is what makes it computable. The strongest detectors are the ones that **protect the collector**, because they catch the precise way this platform could be gamed against them.

Detector definitions, thresholds and minimum-data preconditions are in `AI.md`.

---

## Where the intelligence is, and where we deliberately left it out

The brief says AI/ML should be used *"wherever sufficient training data is available."* We take that instruction literally:

- **Classification is a human tap**, by choice — the person holding the material is the better classifier.
- **Valuation is a lookup**, by choice — a regression on a handful of observations would be pretending.
- **Matching is an explainable weighted score**, because the user must be able to disagree with it.
- **Anomaly detection is the machine's job**, because finding a pattern across thousands of transactions is the thing no individual can do.

A team that names which parts are models and which are arithmetic understands the problem. A team that calls everything AI does not.

---

## What the system accumulates

Every closed lot adds to four things.

The collector's **earnings ledger** — a transaction history, and eventually a financial identity, for someone with no bank statement, no ledger and no credit record.

The **traceability chain** — collection point to authorised facility, with both parties' confirmations, which is the first-mile evidence that does not exist today.

The **price dataset** — a real observed series of what informal e-waste actually fetches, by category, location and date. Nothing like it currently exists anywhere in India.

And a **labelled image corpus.** This is the part worth understanding properly: there is no dataset of Indian informal-scrap imagery, which is exactly why we do not claim a trained classifier today. But every lot in the app is a photograph paired with a **human-verified category label — the collector's own tap is the annotation.** The application is a labelling pipeline that runs as a side effect of people getting paid. After a few thousand lots we hold the dataset that does not exist today, and only then does a classifier become honestly trainable.

The dataset is generated by use, not shipped as a file — which is precisely what the brief asks teams to demonstrate.
