# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

static HTML/CSS — the user asked for "a .html of the top 5", then for the top ten. One self-contained file (`sih-top10.html`, extending `sih-top5.html`), no build step, viewable offline and publishable as an Artifact.

## Users

**Primary:** a six-person undergraduate team in Maharashtra entering Smart India Hackathon 2026. They must choose one problem statement from 229 and defend that choice to their college's internal-round judges **within 48 hours**. Team composition is confirmed: UI/UX designer, confident presenter, backend/data engineer, plus full-stack and mobile/offline capability. They use LangChain/LangGraph and consume ML through APIs rather than training models. They have no dedicated domain/field-research member. Field access is limited to a day or two.

**Secondary:** the internal-round judges and the college SPOC, who see the team's reasoning second-hand through its pitch and are deciding whether this team can represent the institute nationally.

**Reading situation:** high pressure, short time, likely on a laptop with a phone as a fallback, re-read repeatedly over two days, and passed around a group chat. Scanned before it is read.

## Product Purpose

A decision dossier that closes a choice. It presents ten ranked SIH 2026 problem statements — each with problem, root cause, competitors, gap, technology fit, USP, scores and an attempt to break it — plus the two finished outside the ten, so the team can commit to one statement and defend it under questioning. Ranks 1–3 carry the full nine-block treatment; ranks 4–10 are documented and then refused, because the reason each is out is the answer a judge will ask for. Success is the team committing within 48 hours and being able to answer any challenge to the pick without re-reading.

## Positioning

Every other SIH shortlist circulating online ranks problem statements by theme and vibe. This one is evidence-first and adversarial: each candidate is actively attacked, several were eliminated because the sponsoring ministry had already shipped the thing the statement asks for, and the ranking is computed twice — once on problem quality, once calibrated to this specific team's stack, state and deadline. It also surfaces a statement the two most-circulated catalogues omit entirely.

## Operating Context

SIH's official flow: internal college hackathon → institute nomination → idea submission on sih.gov.in (deadline 20 September 2026) → Grand Finale. Judging uses five rubrics at 10 marks each — Innovation/Originality, Feasibility/Realistic Implementation, Social-Environmental Impact/Business Value, Technical Execution, Presentation. Teams are six students, minimum one female member, same institute. Submissions cap at 500 ideas per problem statement; SIH 2025 drew 72,165 submissions across 271 statements.

## Capabilities and Constraints

Single self-contained HTML file, no external assets beyond Google Fonts, must render correctly in light and dark themes, must work on a phone, and must stay legible when a judge or teammate opens it cold. Content is fixed and already researched — this surface presents it, it does not generate new analysis. Wide comparison content must scroll inside its own container rather than the page.

## Brand Commitments

None binding. The existing long-form dossier uses Newsreader / Public Sans / IBM Plex Mono on an indigo-biased neutral; the user has asked for the UX to be improved, so that world is evidence rather than authority.

## Evidence on Hand

All content is researched and cited in this session: the ten ranked statements (SIH26229, SIH26047, SIH26034, SIH26045, SIH26107, SIH26168, SIH26018, SIH26102, SIH26145, SIH26124) and the two below the line (SIH26143, SIH26104), their five-factor and eight-criterion scores, competitor findings (Recykal, Kabadiwalla Connect, Phreesia, EkaScribe, TKDL, Smart Consumer/GS1 DataKart, Skill India Digital Hub), government sources (MoSPI CPI 2024 FAQ, PIB on E-Waste Rules 2022, ABDM Scan & Share, SIH project-implementation guidelines), and the verified finding that SIH26227–26229 are absent from the circulating BlinkNBuild PDF and the sih2026.vuce.in mirror. No figure in this surface may be invented; anything not established in the research is marked as inference.

## Product Principles

1. **Rank, then justify.** The reader arrives to decide, so the ordering and the numbers come first and the reasoning supports them.
2. **Attack every candidate.** A dossier that only argues for its picks is untrustworthy; the "why this could fail" section is load-bearing, not decoration.
3. **Separate fact from inference.** Every claim is labelled, because the team will be cross-examined on them.
4. **Two rankings, never blended.** Problem quality and team fit are different questions with different answers; merging them hides the reason for every position.
5. **Built for 48 hours.** Scannability outranks completeness; a reader must be able to extract the decision in thirty seconds and the defence in ten minutes.

## Accessibility & Inclusion

Must remain readable at phone width and in both colour schemes. Colour never carries meaning alone — verdicts and scores are labelled in text as well. Respects `prefers-reduced-motion`.
