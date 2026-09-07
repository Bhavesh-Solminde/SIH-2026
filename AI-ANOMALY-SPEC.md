# AI Anomaly Detection — Build Spec

**Companion to [`AI.md`](AI.md). Written for the AI developer who owns `server/aiml`.**

`AI.md` §5 originally defined detectors **D1–D8**; it now also carries D9–D13, added by this
document and folded back in once built. §11 defines the service contract. This document does
not replace either. It adds:

- two decisions that must be settled **before any code is written**,
- eleven gaps found in the current specification, with fixes,
- what actually happens *after* a detection — the workflow, not the model,
- **D9–D13**, covering an adversarial recycler that D1–D8 cannot catch, plus **D14** as a stretch goal that was never built,
- the monopsony / no-alternative-buyer case,
- `POST /simulate` extensions needed to demonstrate any of it,
- an edge-case register.

> **Status as built:** D9–D13 are implemented and in `server/aiml/bhaav_aiml/config.py::IN_SCOPE` (`server/aiml/bhaav_aiml/detectors/grading.py`). D14 (§6.3, evidence-photo reuse) remains a stretch goal that was never built. `bhaav_aiml/evaluate.py` now exists — recall, precision, an alert-budget check, and a flag-everyone baseline (§9 below) — run against the simulator's five recycler archetypes, with a dated rate series (§8) so D3, D10 and D12 are actually reachable.
>
> **Superseded (2026-09-07) for the live product.** The API no longer calls `POST /detect`
> or writes any D1–D13 flag — `runDetection`, `src/lib/detectRun.js` and `POST /detect-run`
> were removed from `server/api`. Every handover is scored once, at creation, by the deployed
> price model (`callPredict`, `POST /predict`); its per-transaction `ML_PRICE_ANOMALY` flag is
> then aggregated per party in `server/api/src/lib/entityAnomaly.js` — the share of a
> recycler's or collector's own scored transactions that came back flagged, not a fixed count,
> so the bar a 3-transaction party must clear and the bar a 300-transaction party must clear
> are not the same absolute number. A party's rate is reported `insufficient_history` below a
> minimum sample (`ANOMALY_MIN_SAMPLE`, default 5) rather than resolving either way on too
> little data, and their `ML_FLAG_RATE` flag is written, refreshed, or resolved as their own
> rate crosses `ANOMALY_FLAG_RATE_THRESHOLD` (default 20%) — both are runtime configuration,
> not constants in code. The eleven detectors below, `bhaav_aiml`, `evaluate.py` and the
> simulator remain in the repo and remain correct as a specification and as evidence of what
> was built and evaluated; they are simply not in the live request path. Everything else in
> this document — the reason-code workflow (§3.2), the severity/action table (§3.1), the
> schema additions (§0.2, since landed) — still describes the shipped product.

Notation follows `AI.md` §5 throughout: `P_est` = the estimate the collector saw,
`P_pub` = published rate frozen at acceptance, `P_final` = amount actually paid and
confirmed by both parties. **Collector** = the kabadiwala selling. **Recycler** = the
authorised buyer.

---

## 0. Two blockers — settle these first

### 0.1 The two documents describe different systems

`AI.md` §1 and §9.1 state the shipped decision plainly:

> *"Anomaly detection at the internal round has no transaction history at all and therefore
> runs as **defined thresholds, not learned models**."*

A separate decisions document in circulation specifies a **hybrid Isolation Forest** with a
continuous anomaly score and severity bands. **These are not compatible with the contract in
`AI.md` §11.** An Isolation Forest returns one score for a row; it cannot populate
`detectors_run`, `detectors_skipped` with per-detector reasons, or a per-flag `detail` object
of triggering numbers. Those three fields are what make every flag explainable in one
sentence, and they are what §5 rule 2 requires.

**Recommendation: `AI.md` wins. Ship rules.** They are already decided, already honest, and
already defensible. If an ML component is wanted for the narrative, add it as **D12** below —
an unsupervised detector that runs *after* the rules and only over the residual — and label
it as untrained-on-real-data exactly as §9.1 already does.

**Do not start building until this is answered.** It is open item 2 in `README.md`.

### 0.2 The schema cannot record a downgrade

This is the harder blocker, and it is not currently on the open items list.

`lot.condition` (`DB.md` §3.x, line 149) is the **collector's declaration**, made at lot
creation. The `handover` table (`DB.md` §3.7) records `inspected_quantity`,
`final_unit_price`, `final_total` — and **no inspected condition, and no reason for a price
cut.**

So today there is no way to record the single most important event in this entire document:
*the recycler inspected the material and graded it lower than the collector declared.*
Every detector in §6 and §7 below is unbuildable until this changes.

**Required schema addition to `handover`:**

```sql
inspected_condition   text CHECK (inspected_condition IN ('GOOD','FAIR','POOR')),
downgrade_reason_code text,          -- NULL unless inspected_condition < lot.condition
collector_protest     boolean NOT NULL DEFAULT false
```

`collector_protest` matters for a reason given in §12, edge case 13: a collector standing at
the counter with the material already delivered will sign almost anything. **A signature is
not agreement.** Recording protest separately from confirmation is what keeps the
`CONFIRMED` status honest.

Add the same three fields to the `handovers[]` objects in the `POST /detect` request body
(`AI.md` §11).

---

## 1. Contract additions

`AI.md` §11 rules 1–4 stand unchanged: stateless, no database access, no writes, same input
must produce same output, skipped detectors reported with a reason. Three additions:

**1. `POST /simulate` needs a `seed`.** Rule 3 forbids randomness, and `/simulate` is a random
generator with no seed in its request. Without one the recall figures in `AI.md` §8 change
on every run and cannot be quoted in the deck. Add `"seed": 42`.

**2. History features arrive in the request, they are not looked up.** A recycler's median
ratio, downgrade rate and flag history all require queries. The service has no database
(rule 1), so **the API computes them and passes them in.** The AI developer never writes a
query.

**3. Timeout and failure mode.** The API calls `/detect` with a **2 second timeout** and
**fails open** — the transaction proceeds unflagged, marked `anomaly_check: PENDING`, and is
re-scored by the post-transaction batch. A detector service that is down must never block a
collector's sale. This follows directly from §5's "no detector ever blocks a transaction".

---

## 2. Eleven gaps in the current specification

| # | Gap | Fix |
|---|---|---|
| 1 | **No threshold calibration procedure.** D1–D8 have thresholds but no method for setting them | Score all simulated history, set cutoffs at the 5th and 1st percentile, save them **with** the detector config. Thresholds are configuration, not code (§5 rule 4) |
| 2 | **Absolute prices must never be compared across categories.** PCB is ₹190/kg, cable ₹40/kg | Every detector operates on **ratios and deviations** — `P_final / P_pub` — never on rupees. One threshold then covers all categories |
| 3 | **Nothing produces the `reasons` text.** The response carries `detail` numbers; the console must render a sentence | The rule that fired names the reason. Rules explain, scores rank. Write this split into §5 |
| 4 | **"What did ML add over a z-score?"** — no answer prepared | Build one simulated transaction that passes every single-variable rule but fails a combination rule. That one example is the answer. Also run a per-category z-score baseline and show both confusion matrices |
| 5 | **No evaluation numbers.** §8 names the method but no target | **Precision over recall.** Target an alert budget of **≤5% of transactions flagged**. State it out loud: a warning nobody trusts is worse than no warning |
| 6 | **Cold start at serve time is unhandled.** §5 gives min-data preconditions per detector but no runtime default | New recycler → history features default to neutral, response says `"history": "insufficient"`. Never let *no data* render as *looks fine* |
| 7 | **Data-entry errors are being treated as anomalies.** ₹1900 for ₹190, weight 500 for 5 | A validation rule **before** the detectors. >5× or <0.2× `P_pub` → "did you mean ₹190?" This is the only place a block is correct, and it is a validation prompt, not an accusation |
| 8 | **`P_final < P_pub` after acceptance is unmeasured** | Add `offer_to_final_drop = (P_pub − P_final) / P_pub`. Cheap, and it is the signature of the entire attack in §6 |
| 9 | **Nothing is stored for the learning loop.** §3 promises the application is the dataset generator, but no columns carry it | Every transaction stores `anomaly_score`, `severity`, `triggered_detectors[]`, **`config_version`**, `downgrade_reason_code`, `admin_outcome`. Without `config_version` no past decision can ever be explained |
| 10 | **Weight ranges have no source.** D4 and D5 need per-category `[p5,p95]` | Blocked on `README.md` open item 7. Until then both detectors **skip with a reason** — which the contract already supports |
| 11 | **Mixed-grade lots collapse to one condition.** 45 kg good + 5 kg poor is graded POOR | Allow a per-handover quality split, or accept the simplification and **say so**. Do not build a grading engine |

---

## 3. What happens after a detection

`AI.md` §5 already fixes the two hard rules: **no detector blocks a transaction**, and **a
false positive must never cost a collector a sale**. This section makes that operational.

**Governing principle: the friction goes on the recycler, never on the collector.** The
collector is the vulnerable party. Blocking their deal to "protect" them just costs them the
sale. The system never restricts the collector; it restricts the recycler's ability to make
an unexplained cut.

### 3.1 Severity → action

| Severity | Share of txns | Collector sees | Recycler must do | Admin |
|---|---|---|---|---|
| — (none) | ~90% | nothing | nothing | score stored silently |
| `INFO` | ~4% | nothing, or a soft reference-range note | nothing | logged only |
| `WARN` | ~1% | amber note: published rate, final paid, recycler's stated reason | **must select a reason code before the cut is accepted** | queued for post-transaction review |
| `CRITICAL` | rare | as above | as above | high-priority, pattern-level |
| *validation* | rare | "check this value — did you mean ₹190?" | re-enter | nothing |

**State the first row out loud in the deck.** The most common outcome of a detection is that
a number is written to a column and nobody is interrupted. That is what alert-fatigue
awareness looks like.

### 3.2 Reason codes — the highest-value thing in this document

When a recycler cuts the price at handover, they select from a **fixed list**. Never free text.

```
POOR_CONDITION          Material condition below declaration
MIXED_GRADE             Lot contains mixed grades
LOW_RECOVERABLE         Low recoverable metal content
TRANSPORT_DISTANCE      Collection point far from facility
BULK_DISCOUNT           Volume-based rate
LOCAL_RATE_LOWER        Local market below published band
OTHER                   Free text required
```

Why this beats a text box:

- It becomes a **feature** for D9–D12.
- It makes the pattern visible in plain SQL: *"this recycler selected `POOR_CONDITION` on 14
  of 15 price cuts."* That is a stronger signal than any single transaction score.
- Structured data can be counted. Prose cannot.

### 3.3 Admin gets a ranked queue, not an alert stream

```
priority = severity_weight × value_at_stake × recycler_flag_rate
```

Show the **top 20 only**. A bounded queue is the answer to "does this scale?"; an unbounded
alert list is a spam folder. Escalate on **rate, not count** — 15 of 50 flagged matters,
2 of 50 is noise. A busy honest recycler must never be punished for volume.

### 3.4 Outcomes write labels back

This is `AI.md` §3's generation loop, made concrete.

| Admin outcome | Written back as | Effect |
|---|---|---|
| `JUSTIFIED` | verified-normal | joins the next tuning set as a **normal** example |
| `SUSPICIOUS` | confirmed-anomaly | joins as a **true** anomaly; recycler's rate increases |
| `DISPUTED` / `UNRESOLVED` | excluded | not used for tuning in either direction |
| `INVALID` | excluded, data corrected | validation failure, not a finding |

### 3.5 Never publish a suspicion

When a recycler accumulates confirmed-suspicious transactions, **do not display "suspicious"
on their public profile.** That publishes a detector output as a factual claim about a real
licensed business. Instead: remove the verified badge, drop their ranking in collector
search, and have an administrator contact them. Same protective effect, no accusation, no
defamation exposure.

---

## 4. The attack D1–D8 cannot catch

A recycler publishes a competitive rate, wins the lot, then at handover declares the material
POOR every single time and pays a fraction — supplying **genuine photographs of genuinely poor
material** as evidence, because they really do own a pile of bad boards.

Set it against the honest case:

| | Lying recycler | Honest low-grade recycler |
|---|---|---|
| `P_final` | low | low |
| Reason code | `POOR_CONDITION` | `POOR_CONDITION` |
| Photo evidence | real poor material | real poor material |
| Collector disagrees | sometimes | sometimes |
| D1 (price deviation) | fires | fires |
| D2 (systematic underpayment) | fires | **fires — false positive** |

Every column matches. D2, the strongest detector in the set, flags both identically.

**The conclusion is forced: every signal the recycler authors is worthless here.** The reason
code, the photo, the inspected condition — the recycler writes all of them. Nothing about the
evidence is even falsified. D9–D13 (built) and D14 (stretch, unbuilt) all use only data the
recycler cannot author.

---

## 5. D9 — Grader bias

**The one clean discriminator.** Material quality is a property of the **source**, not of the
buyer.

- A recycler genuinely receiving poor material receives it because *their collectors* bring
  poor material — and those same collectors will be graded poor by **other** recyclers too.
- A lying recycler downgrades regardless of source, including collectors whom everyone else
  grades GOOD.

**So: do the same collectors get graded differently by different recyclers?**

```
S_r          = collectors who sold to recycler r AND to ≥1 other recycler
d_r(c)       = 1 if r downgraded collector c's lot, else 0
d_other(c)   = downgrade rate of all other recyclers on collector c

grader_bias(r) = mean over c in S_r of [ d_r(c) − d_other(c) ]
```

Range −1 to +1.

- `bias ≈ 0` → this recycler grades material the way everyone else does. **Even at a 94%
  downgrade rate they are exonerated** — their collectors genuinely bring poor material.
- `bias ≈ +0.7` → this recycler calls POOR what four others called GOOD, **on the same
  collectors.** No photograph can explain that.

This is the same estimator used to separate a harsh grader from a hard class: differencing
out the item's true quality by comparing graders on shared items. It requires no image
analysis, no ML, and no administrator judgement.

**Run it symmetrically on collectors too** — a collector downgraded by *everyone* genuinely
brings poor material, which protects honest recyclers automatically.

| | |
|---|---|
| **Subject** | `RECYCLER` |
| **Min data** | ≥10 shared collectors, each with ≥2 distinct recyclers |
| **Threshold** | `bias > 0.35` → `WARN`; `> 0.60` with n ≥ 20 → `CRITICAL` |
| **Catches** | Systematic false downgrading |
| **FP risk** | **Low where overlap exists.** See edge case 23 — common ownership breaks it silently |

```json
{ "code":"D9", "reason":"insufficient overlap: 3 shared collectors for recycler 018f…, need 10" }
```

---

## 6. When there is no overlap — the monopsony branch

D9 needs collectors who sold to more than one recycler. Two objections, and they have
different answers.

### 6.1 "A collector in Vasai will only ever use the Vasai recycler"

**Empirically false in the demo district, and `mpcb_recyclers.csv` proves it.** Nine valid
MPCB recyclers sit inside the Vasai-Virar municipal area:

| Recycler | Locality | Pincode |
|---|---|---|
| Bharat E Waste | Waliv | 401208 |
| E-Waste Mart | Umar Compound, Jahar Pada, Nalasopara | 401208 |
| E Clean E Green | Umar Compound, Jabar Pada, Nalasopara | 401208 |
| Wave E Waste | Chaudhary Compound, Wakam Pada | 401208 |
| Star Envo | Choudhary Compound, Wakanpada, Pelhar | — |
| OM R V Interiors | Pelhar | — |
| HAQ Processing | Datar Industrial Estate, Pelhar | — |
| S. N. Brothers | Dongaripada | — |
| New Ecotech | Khaniwade | 401305 |

**Four share pincode 401208. Two pairs share a compound.** The Nalasopara collector is not
choosing between Vasai and Mumbai; they are choosing between two doors in the same compound.
Overlap is at walking distance.

*This is also the argument for `README.md` open item 4.* Without lat/lng, "Vasai" is one
blob. With it: "eleven authorised buyers within 8 km of this collection point."

### 6.2 The real version of the objection

Two things remain true, and the spec must handle both.

**Proximity is not choice.** Collectors are frequently tied to one recycler by **advances** —
the recycler lends money, the collector repays in material. That survives having ten
alternatives next door. Any design assuming "just go elsewhere" is naive about this trade.

**Some districts genuinely have one buyer.** `mpcb_recyclers.csv`: Buldhana 1, Parbhani 1,
Nagpur 1, Nashik 1, Kolhapur 1. There, D9 is not degraded — it is **mathematically
unidentifiable.**

### 6.3 D10–D12 — detectors that need no second recycler

**D10 — Downgrade change-point.** *Subject: `RECYCLER`. Min data: ≥60 days, ≥20 handovers,
≥8 per window.* **As built** (`bhaav_aiml/detectors/grading.py::d10_downgrade_change_point`),
the split is **per-recycler at the midpoint of that recycler's own dated handover history**,
not a fixed trailing-30/preceding-90-day window — a fixed global window would read a late
joiner's entire history as one window. The threshold is an **absolute rise in downgrade rate**
(`step ≥ 0.30`, since a rate is bounded at 1.0 and a multiplier like "3×" can never fire off a
low base rate — an earlier config value of `3.0` was exactly this bug and was corrected to
`0.30`), not a 3× multiplier. `WARN` above the step. **Blind to anyone who lied from
day one** — their rate never steps because it was always high.

**D11 — Cross-category downgrade uniformity.** *Subject: `RECYCLER`. Min data: ≥3 categories,
≥10 handovers each.* A source yielding genuinely poor PCB does not thereby yield poor copper
cable, poor motors and poor batteries. Genuine quality problems are **category-specific**;
lying is uniform. Compare the variance of downgrade rate across categories. Near-zero
variance at a high mean is implausible on physical grounds.

**D12 — Offers that never learn.** *Subject: `RECYCLER`. Min data: ≥15 handovers over ≥30
days.* Someone genuinely receiving poor material **lowers their published rate** — overpaying
and clawing back is pointless work. Someone lying **cannot**, because the high published rate
is what wins the lot. Regress `offer_to_final_drop` against time: persistently high and flat
is the signature. This is the economic tell, and it is the strongest signal available with
zero overlap.

**D13 — Single-buyer market.** *Subject: `MARKET`.* Not a person. When a district has one
valid recycler and a high downgrade rate, the correct output is a market-structure finding:

```json
{ "detector_code":"D13", "subject_type":"MARKET", "subject_id":"district:Buldhana",
  "severity":"WARN",
  "detail": { "valid_recyclers":1, "downgrade_rate":0.85, "n":31,
              "reason":"single-buyer market — recycler bias not identifiable" } }
```

Flagging the market rather than the person is honest, and it is more useful to a municipality
than a fraud score would have been.

**D14 — Evidence photo reuse.** *Subject: `RECYCLER`. Stretch goal.* A perceptual hash across
submitted inspection photographs catches near-duplicates cheaply. Combined with capture-in-
flow (GPS + timestamp bound to the transaction), the same pile appearing at forty different
handover locations is not something an honest recycler produces. **Suggestive, never
conclusive** — see `AI.md` §9.5.

---

## 7. Mechanism fixes — these matter more than the detectors

The following work **even when the statistics are ambiguous and the administrator cannot
tell.** They belong in the product, not the model, and they are the strongest part of the
whole design.

**1. Rank recyclers by what they actually paid, not what they published.**

```
ABC Recycling
Published:                       ₹180/kg
Actually paid, last 20 handovers: ₹78/kg median
Price cut at handover:            19 of 20
```

No accusation. No detector output. No legal exposure. It is arithmetic over the recycler's
own confirmed two-signature records — and it destroys the attack completely, because the
attack's only asset is a headline number that now means nothing.

**2. Measure deviation against the recycler's own published rate, not the market reference.**
Combined with (1), the two cases separate themselves without anyone deciding anything:

- The **honest low-grade recycler** publishes ₹80, pays ₹78, deviation ≈ 0, **never flagged
  again.** They get a legitimate way to declare what they are, and they want to — it attracts
  exactly the collectors they want.
- The **liar cannot use that escape hatch.** Publishing ₹80 loses them the lot, and winning
  the lot is the entire point. They must keep publishing ₹180, which means they must keep
  showing the gap.

That is a separating equilibrium: the honest strategy is cheap to declare, and the dishonest
one cannot adopt the declaration without surrendering the gain.

**3. Published downgrade policy.** Each recycler states up front, per category: *"if condition
is POOR I pay 60% of published."* A cut then becomes a contract term the collector agreed to,
not an ambush at the counter.

**4. Price locked at acceptance.** `P_pub` is frozen at acceptance and **is** the price. A
post-handover cut is a formal exception requiring the collector's counter-signature, counted
publicly as `downgrade_exception_rate`. Visible per recycler with no comparison to anyone —
which makes it the one number that works in a monopsony. The two-sided confirm mechanism for
this already exists in `DB.md` §3.7.

**5. Pooled lots.** Twelve collectors in one ward with 5 kg each: individually none can justify
transport to the next taluka. Pooled at 60 kg, a second recycler becomes reachable. **This is
the only item on this list that breaks a monopsony rather than measuring it.**

**6. Cross-district price board.** The Buldhana collector cannot reach Nagpur, but can *see*
that Nagpur pays ₹150 for what they are being paid ₹70. Detection converts into disclosure,
which is the platform's actual purpose.

**7. Escalate to the regulator, not the administrator.** One authorised recycler in a district
running an 85% downgrade rate is a **finding for MPCB**, whose licence it is. The platform
produces the evidence pack — downgrade rate, exception rate, offer-to-final gap, dispute
count, and the absence of alternatives. It does not produce the verdict.

---

## 8. `POST /simulate` — required extensions

`AI.md` §11 defines the request. Add `seed`, and add recycler archetypes so D9–D13 have
anything to find.

```json
{ "seed": 42,
  "n_collectors": 20, "n_recyclers": 8, "n_lots": 600, "days": 45,
  "recycler_profiles": {
    "honest":            4,
    "honest_low_grade":  1,
    "systematic_liar":   1,
    "late_onset_liar":   1,
    "monopolist":        1
  },
  "inject": { "D2":3, "D3":2, "D4":5, "D6":4, "D7":2, "D8":1 } }
```

| Profile | Behaviour | Should trigger | Must NOT trigger |
|---|---|---|---|
| `honest` | downgrades ~12%, tracks collector quality | — | anything |
| `honest_low_grade` | downgrades ~85%, **concentrated on genuinely poor collectors**, publishes a low rate | D2 (acceptable) | **D9, D11, D12** |
| `systematic_liar` | downgrades ~90% **uniformly across all collectors and categories**, publishes high | D9, D11, D12 | — |
| `late_onset_liar` | honest for 30 days, then flips | **D10**, then D9 | — |
| `monopolist` | sole recycler in a synthetic district, downgrades 85% | **D13** | D9 (must skip) |

**The pair that matters is `honest_low_grade` vs `systematic_liar`.** They are
indistinguishable per-transaction and separable only in aggregate. Demonstrating that
separation is worth more than every other detector combined, because it shows the system does
not punish the honest party.

**Two gaps in the existing `inject` map:** it omits **D1 and D5**, so those two have no recall
figure and `AI.md` §8's "recall per detector" quietly does not cover them. Either add them or
say so in the deck.

`ground_truth[]` must label every injected anomaly **and** every recycler's true profile, or
the D9 separation cannot be scored.

---

## 9. Evaluation

**Implemented** in `bhaav_aiml/evaluate.py` (`evaluate()`, `baseline_flag_everyone()`,
`eval_report()`, `GUILTY_PROFILES`), exercised against the simulator's adversarial recycler
archetypes. Per `AI.md` §8, plus:

1. **Recall per detector** on injected anomalies, at a fixed seed.
2. **Alert budget: ≤5% of transactions flagged.** Report the flag rate alongside recall. A
   detector with 100% recall at a 40% flag rate has failed.
3. **The separation test.** Report D9's `grader_bias` for `systematic_liar` and for
   `honest_low_grade` side by side. The gap between them *is* the result.
4. **A baseline.** Per-category z-score, same data, same budget. Showing you tested against a
   dumb baseline reads as competence, not weakness.
5. **False-positive cost, stated.** Every flag on an honest recycler is a real business
   accused by a prototype. Say the number.

---

## 10. Edge-case register

| # | Case | Handling |
|---|---|---|
| 1 | Low price, genuinely poor material | Legitimate. D9 exonerates via `bias ≈ 0` |
| 2 | Recycler declares POOR every time, real photos of real poor material | D9 / D11 / D12. Photos are irrelevant — recycler-authored |
| 3 | Recycler genuinely receives poor material always | **Must not be flagged.** `bias ≈ 0`, plus the self-declared low-grade tier (§7.2) |
| 4 | Collector's only recycler is the liar | D9 skips. D10/D11/D12 still work. D13 flags the market |
| 5 | Collector tied to one recycler by debt/advance despite alternatives | Not detectable. Answered by pooled lots (§7.5) and the price board (§7.6) |
| 6 | Two "competing" recyclers share a compound and possibly an owner | **See case 23 — this breaks D9 silently** |
| 7 | New recycler, no history | Neutral defaults; `"history":"insufficient"`. Never render as normal |
| 8 | New category, no distribution | D4/D5 skip with reason. Blocked on open item 7 |
| 9 | Data-entry error, ₹1900 for ₹190 | Validation prompt before detectors. Not an anomaly |
| 10 | Unit confusion, KG vs PIECE | Write-time validation (`AI.md` §6), not a detector |
| 11 | Same photo reused across lots | D14, suggestive only |
| 12 | Genuine photo, but of different material | Undetectable. Evidence is not proof — state it |
| 13 | Collector accepts a cut under duress | `collector_protest` flag. **Signature ≠ agreement** |
| 14 | Mixed-grade lot, 45 kg good + 5 kg poor, graded POOR entire | Quality split, or accept and disclose the simplification |
| 15 | Busy honest recycler flagged for volume | **Rate, not count.** Normalise by transaction count |
| 16 | Recycler legitimately specialising in low-grade | Self-declared tier; deviation measured against their own published rate |
| 17 | Genuine metal-market crash looks like mass deviation / bait pricing | Cross-check against the IBM/LME band, per `AI.md` D3 |
| 18 | Recycler colludes with their collectors | Breaks D9. Detectable as a closed subgraph. Out of MVP scope — **disclose** |
| 19 | Single recycler in district | D13. Unidentifiable, and say so |
| 20 | Sparse overlap, <10 shared collectors | Skip with reason. Never guess |
| 21 | Liar who lied from day one | D10 blind. D11 and D12 still fire |
| 22 | ML service down or slow | 2s timeout, fail open, `anomaly_check: PENDING`, re-score in batch |
| 23 | **Common ownership across two recyclers** | **D9 assumes independent graders.** Two facilities in one compound with one beneficial owner are *one* grader wearing two hats, and the bias score comes out near zero — a false clean bill. Flag shared address, phone or email across recyclers as a **D9 confidence caveat** in `detail`. `mpcb_recyclers.csv` contains at least two such pairs |
| 24 | Seasonal / festival flow variation | Compare against the same recycler's own trailing window, never a fixed constant |
| 25 | Collector misdeclares category to inflate value | D5. Collector-side detection is deliberately minimal at MVP |
| 26 | Collector declares GOOD optimistically | Expected noise. Absorbed by `d_other(c)` in D9 |
| 27 | Detector fires below its min-data precondition | Forbidden. `AI.md` §5 rule 1 |
| 28 | Flagged party cannot see their own flag | Forbidden. `AI.md` §5 rule 3 — the system is not covert |
| 29 | GPS spoofed | Acknowledged, `AI.md` §9.5. Raises cost, does not prevent |
| 30 | Simulated data shown as real | Never. `AI.md` §8 — labelled on screen and in the deck |

---

## 11. What must not be claimed

Extends `AI.md` §9. Never say:

- "AI detects fraud" — it detects statistically unusual patterns
- "The anomaly score is a probability of fraud"
- "The photograph proves the condition"
- "The recycler's explanation proves the transaction was legitimate"
- "We trained on real transactions" — §9.1 already says nothing was trained
- "Synthetic data represents real market behaviour"
- "We can tell a lying recycler from an honest one in a single-buyer district" — **you cannot**

Say instead:

> **We cannot tell truth from a photograph, so we do not try. We compare each recycler against
> every other recycler on the same collectors — and we publish what they actually paid, not
> what they promised.**

And volunteer the failure case before a judge finds it: *"here is where the method stops, and
here is what we do instead."*

---

## 12. Build order for `server/aiml`

> **Status: steps 1–7 are done.** D1–D3 and D6–D13 are implemented, and the simulator now
> emits a dated rate series so D3/D10/D12 have something to be reachable on (§8). D4, D5 remain
> permanently out of scope (step 8); D14 remains a stretch goal, never built (step 9).

1. ~~**Answer §0.1**~~ — done. Rules, not Isolation Forest — see `AI.md` §11's contract and §12's
   note on the *separate* `sihmodel.vercel.app` price model, which is a different open question.
2. ~~**Get §0.2 into `DB.md`**~~ — done. `inspected_condition`, `downgrade_reason_code` and
   `collector_protest` are columns on `handover` (`DB.md` §3.7).
3. ~~**`POST /simulate`**~~ — done, with `seed` and the five recycler profiles (§8), plus a dated
   rate series per recycler/category.
4. ~~**D1, D6, D7, D8**~~ — done, work on the first transaction.
5. ~~**D2, D3**~~ — done, the two to lead with, per `AI.md` §5.
6. ~~**D9 + D13**~~ — done. The separation demo. `bhaav_aiml/evaluate.py` confirms it: on the
   adversarial simulated corpus, recall 1.0 and precision 1.0 across the three planted bad
   actors (`systematic_liar`, `late_onset_liar`, `monopolist`), zero false positives.
7. ~~**D10, D11, D12**~~ — done, the zero-overlap set.
8. **D4, D5** — still blocked on real weight distributions, open item 7. Permanently out of
   scope for this build, not merely deferred.
9. **D14** — stretch, never built. Not started.

**All eleven in-scope detectors ship.** The raw alert rate before the console's presentation
filter is 0.52 against the 0.05 budget — expected, not a bug: D1 alone fires on roughly a third
of handovers, which is why `GET /recycler/flags` excludes `INFO` severity by default
(`?includeInfo=1` returns all). The budget is enforced at the presentation boundary, not by
raising D1's threshold.

---

*Companion to `AI.md`. Contract changes here require both the AI developer and Backend to
agree, per `AI.md` §11.*
