# The two environmental features — Bhaav / SIH26229

**Status: both HELD by the user on 2026-09-06. Neither is built. Nothing exists for either — no schema, no migration, no endpoint, no UI.**

Recorded in `AgentContext.md:192`, `README.md:136-137`, `flow_audit.md:175-176`.
This document is the decision record: what each one is, what it would cost, and what the product actually gains from each.

**Context that decides everything below:** the sponsor is the **Ministry of Mines / JNARDDC, Nagpur**, theme *Clean & Green Technology*. Idea submission closes **20 September 2026**. A judge from the sponsoring ministry knows mineral recovery figures the way we know our own schema.

---

## 1. Critical Mineral Ledger

**Source:** `docs/superpowers/plans/2026-09-06-repair-sms-and-evidence.md:866` (Task 11)

### What it is

Turn confirmed handovers into a defensible statement of how much of each critical mineral the network recovered, by month and district.

### What already exists

- `Category.criticalMinerals String[]` — `server/api/prisma/schema.prisma:86`
- Seeded across 16 categories — `server/api/seed/categories.js`: copper, aluminium, gold, silver, palladium, tantalum, gallium, indium, lead, yttrium, lithium, cobalt, nickel, neodymium, dysprosium
- Already surfaced in history payloads — `server/api/src/lib/history.js:29,118`
- `Handover.inspectedQuantity` (Decimal 10,3) and `Handover.status` — `schema.prisma:184,193`
- `Recycler.district` — `schema.prisma:58` (the grouping key already exists)

`DB.md:118` states the intent plainly: *"`critical_minerals` is not decoration. Lithium, cobalt, neodymium, tantalum, gallium, indium are why the Ministry of Mines commissioned this statement, and this column is what lets the pitch say so with data behind it."*

### What is missing

| Piece | State |
|---|---|
| `MineralCoefficient` table + migration | not written |
| Sourced, citable coefficients | **not sourced — this is the real work** |
| Aggregation query / endpoint | not written |
| Console screen | not written |
| Tests | not written |

Schema shape from the plan:

```
MineralCoefficient {
  categoryCode
  mineral
  gramsPerKg
  sourceCitation
  sourceYear
  @@id([categoryCode, mineral])
}
```

Aggregation:

```
Σ (handover.inspectedQuantity × gramsPerKg)
WHERE handover.status = 'CONFIRMED'
GROUP BY mineral, month, district
```

### The mechanism, stated properly

- **Environmental action:** an informal collector routes a lot to an *authorised* recycler instead of an unregulated one, and the handover is counter-signed by both parties.
- **What changes in the real world:** material that would have been informally stripped enters a permitted recovery chain, and — for the first time — the quantity is recorded at the point of transfer rather than estimated from municipal tonnage.
- **How the system enables it:** the two-signature handover record already exists and is already the product's core loop. The ledger adds nothing to the collector's workflow; it reads what the loop already produces.
- **What can be measured:** grams of a named mineral, per month, per district, computed as `inspectedQuantity × gramsPerKg` over **confirmed handovers only**, with a published citation attached to every coefficient. Labelled `ESTIMATED` everywhere it appears.

That last constraint is the whole feature. **Counting unconfirmed handovers would let anyone inflate a national mineral figure by photographing a pile.** The two-signature requirement is what makes the number defensible, and it is the sentence to say out loud to a judge.

### The hard warning, carried over from the plan verbatim in spirit

> **The engineering is trivial. The real work is sourcing ~10 coefficients from a citable published source. DO NOT INVENT A SINGLE NUMBER.**

A Ministry of Mines judge will know these figures. If a coefficient cannot be sourced, **omit that mineral and say so** — a ledger covering six cited minerals beats one covering fifteen where nine are guessed. One fabricated number destroys the credibility of every other number in the pitch, including the honest field data.

### Cost

| Task | Estimate |
|---|---|
| Schema + migration | ~1 h |
| Sourcing and citing coefficients | **4–8 h, research-bound, cannot be parallelised away** |
| Aggregation endpoint | ~2 h |
| Console screen with citations rendered in-UI | ~3 h |
| Tests (confirmed-only, grouping, citation-present) | ~1.5 h |

The engineering is ~7–8 hours. The sourcing is the schedule risk, and it is a task for a person with a browser, not for an agent.

---

## 2. D14 — "Hazard Gap" / evidence-photo reuse

**Source:** `AI-ANOMALY-SPEC.md:348` (§6.3). Always a stretch goal; `AI-ANOMALY-SPEC.md:551` records it as never started.

### What it is

A perceptual hash across submitted inspection photographs, catching near-duplicates. Combined with capture-in-flow (GPS + timestamp bound to the transaction), the same pile appearing at forty different handover locations is not something an honest recycler produces. **Suggestive, never conclusive** — `AI.md` §9.5.

### Naming correction

"Hazard Gap" appears in this repo **only** as an alias bolted onto D14 (`README.md:136`, `flow_audit.md:176`, `AgentContext.md:192`). There is no separate hazardous-waste detector anywhere in the code or the spec. If a hazardous-material feature was ever intended, it does not exist even as a specification, and the name should be dropped to stop it re-entering the backlog as a phantom.

### It is not an environmental feature

Applying the mechanism test above to D14: *what changes in the real world?* Nothing environmental. D14 changes what an administrator can see about a recycler's evidence. It is **fraud detection**, filed under an environmental heading in `AgentContext.md:192`.

That matters for the pitch. Presented as an environmental feature it is greenwashing and reads as rubric-farming. Presented as what it is, it has a genuine and better job — see the benefit section.

### What already exists

- `Photo { id, lotId, kind, sha256, bytes, uploadedAt }` — `schema.prisma:206`
- `Handover.handoverLat / handoverLng / handoverTs` — the GPS+timestamp half of the mechanism is already there
- Eleven detectors in scope and running — D1, D2, D3, D6–D13 (`server/aiml/bhaav_aiml/config.py::IN_SCOPE`)

### What is missing

- No perceptual-hash column anywhere. `sha256` is a cryptographic hash — it catches byte-identical files and nothing else.
- No hashing library in the pipeline, no backfill, no threshold, no detector, no flags-page treatment.

### The cheap 80%, available today at near-zero cost

`Photo.sha256` already exists and is already populated. A `GROUP BY sha256 HAVING count(*) > 1` across lots detects **byte-identical photo reuse right now** — no schema change, no migration, no library, no model.

Honest caveat: it catches only exact reuse. Any re-encode, resize or recompression defeats it, which is exactly what perceptual hashing exists to solve. But "the same file was submitted for two different lots" is a real signal, it is one query, and it is defensible in Q&A without claiming more than it does.

### Cost of the full version

Perceptual hash column + migration + library + backfill of existing photos + a D14 detector + threshold tuning against the simulator + flags-page rendering: realistically **6–10 hours**, most of it in threshold tuning, which is the part that produces false positives against real recyclers if rushed.

---

## What the product actually gains

### Scored against the five SIH rubrics (10 marks each)

| Rubric | Critical Mineral Ledger | D14 (full perceptual hash) |
|---|---|---|
| Innovation / Originality | **High** — the mechanism, not the metric, is novel | Low — a 12th detector alongside 11 |
| Feasibility / Realistic implementation | **High** — reads a loop that already works | Medium — buildable, tuning is the risk |
| Social & environmental impact / business value | **Highest available gain in the project** | **Zero** — it is not an impact feature |
| Technical execution | Low-moderate — the query is simple, and that is fine | Moderate — genuinely a hard part |
| Presentation | **High** — one repeatable sentence | Low — hard to land in six minutes |

### Why the Critical Mineral Ledger is worth more than it looks

1. **It speaks to the sponsor's actual mandate.** The statement is commissioned by the Ministry of Mines, not a waste ministry. Every other team will pitch waste diverted in kilograms. Diverted kilograms are the *waste* framing; grams of cobalt and neodymium are the *mining* framing, and this jury is a mining jury. Same data, and one of the two framings is aimed at the people in the room.

2. **The defensibility is the differentiator, not the number.** Anyone can multiply tonnage by a coefficient — a spreadsheet does that. Bhaav is the only system in the room where each input row is a **two-party counter-signed handover**, which is why the aggregation can exclude unconfirmed records and still have anything left. The USP is not "we count minerals," it is *"we can tell you why our number cannot be inflated."* That is repeatable by a judge to a colleague an hour later, which is the actual test.

3. **It reframes the whole product for free.** The loop stays exactly as it is. What changes is the sentence at the top of the pitch: from *a price-transparency app for scrap collectors* to *field-level instrumentation for urban mining, which pays the collector to produce the data.* No new user action, no new screen in the collector app, no new risk to the demo.

4. **It converts an existing schema column into evidence.** `criticalMinerals` is seeded and shipping today and currently proves nothing. The ledger is what cashes it in.

**Cost to the product if it stays held:** the pitch keeps a Ministry-of-Mines-shaped hole in it. The impact rubric is answered with collector earnings and waste diverted — real, but the same answer thirty other teams give, in the vocabulary of the wrong ministry.

### Why D14's real value is not environmental

D14's honest job is **protecting the ledger's credibility**. The chain is:

> mineral figure ← confirmed handovers ← inspection evidence ← photographs

If photographs are reusable, the evidence layer is fabricable, and the mineral number resting on it is worth nothing. D14 is the integrity guarantee *underneath* the environmental feature — which is a much stronger thing to say than calling it an environmental feature.

The problem is that this is only worth saying **if the ledger exists**. Built alone, D14 is a twelfth detector in a system that already flags eleven things, and no judge will notice the difference between eleven and twelve.

**And there is already an answer for the Q&A without building it.** When asked *"couldn't a recycler just reuse the same photo?"*, the answer today is: photos are captured in-flow with GPS and timestamp bound to the transaction (`Handover.handoverLat/Lng/Ts`), each is stored with a `sha256`, and byte-identical reuse across lots is a single query. Perceptual near-duplicate detection is specified in `AI-ANOMALY-SPEC.md` §6.3 and deliberately not built. That is a **stronger** answer than a rushed detector with untuned thresholds, because it is entirely true.

---

## Recommendation

### RECOMMENDATION

**Unhold the Critical Mineral Ledger. Keep D14 held.** If any evidence-integrity work happens, spend one hour on the `sha256` duplicate query and stop there.

### WHY

The ledger is the single highest-value unbuilt item for this specific jury, it needs no change to the working loop, and its engineering is a day's work. D14 costs more, earns marks under a rubric the project already scores well on, and has a truthful verbal answer that needs no code.

### ALTERNATIVES REJECTED

- **Build both.** ~15 hours against a 20 September deadline, and the second one adds a detector nobody counts.
- **Build D14 first because it is technically harder.** Technical execution is one rubric of five, and eleven working detectors already demonstrate it. A twelfth is invisible.
- **Ship the ledger with estimated coefficients to save the sourcing time.** This is the failure mode that loses in front of *this* ministry. Fewer minerals, all cited, or nothing.

### RISKS

- **Sourcing stalls.** If citable coefficients cannot be found for enough categories, the feature degrades to a two- or three-mineral ledger. Decide the abort line before starting: fewer than three cited minerals → drop it and lose nothing but the sourcing hours.
- **`ESTIMATED` label drifts off the slide.** Every figure must carry it in the UI, not only in the deck — the plan is explicit about this, and it is what separates a modelled number from an invented one.
- **Scope creep into a national extrapolation.** Report what the seeded and demo handovers actually contain. A national figure from a demo dataset is the exact claim a Ministry judge will take apart.

### NEXT ACTION

Assign one person to coefficient sourcing today — before any schema is written. The engineering is blocked on nothing; the feature is blocked entirely on citable numbers, and that is the only task with an uncertain duration.

---

## NOTES FOR BHAVESH

- **Concept:** an impact metric is only as strong as the *provenance* of the rows it aggregates. Two-party confirmation is what turns a multiplication into evidence.
- **Decision:** aggregate over `status = 'CONFIRMED'` only. Buys defensibility at the cost of a smaller headline number — the right trade in front of a domain-expert jury.
- **Pattern:** a **coefficient table with per-row citation and source year** — provenance stored beside the value, not in a footnote. Same pattern as an audit column or a bibliography table; makes every derived figure traceable to its source without leaving the database.
- **Common mistake:** filing a fraud-detection feature under "environmental impact" because it lives in the same backlog swimlane. Run the mechanism test on anything claimed as environmental — *what physically changes in the real world?* If it cannot be answered, it is a different kind of feature and pitching it as green costs credibility.
