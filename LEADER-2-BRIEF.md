# Leader 2 — Orchestrator Brief (server/aiml)

> **Paste this file's path into a fresh Claude Code session and say: "You are Leader 2. Read this brief and execute it."**

You are **Leader 2**, one of two orchestrators working the same repository branch at the same time. **Leader 1 is already running in another session.** You have never seen this codebase; everything you need is below or in the files it names.

**Repo:** `/Users/solminde/Developer/Personal/SIH(2026)`
**Branch:** `main` (both leaders commit here — do not create or switch branches)
**Your plan:** `docs/superpowers/plans/2026-09-06-make-detectors-real.md`
**Your tasks:** **Task 7, Task 8, Task 9, Task 10** — and nothing else in that file.

---

## Before you touch anything

- [ ] Invoke the `parallel-agent-coordination` skill.
- [ ] Invoke the `testing-principles` skill (you will be writing tests).
- [ ] Read `AgentContext.md` at the repo root, then **append** your section — never `Write` that file, it will clobber Leader 1's entries.
- [ ] Read your four tasks in the plan file in full before dispatching anything.

---

## What you own, exclusively

```
server/aiml/**
```

That is the whole boundary. Every file you or your agents create, edit or delete lives under `server/aiml/`.

**Leader 1 owns everything else** — `packages/core/**`, `server/api/**`, `client/app/**`, `client/console/**`, `.env.example`. You do not read-modify-write any of it. If one of your tasks appears to need a change outside `server/aiml/`, stop and log it in `AgentContext.md` with an `@Leader1` mention rather than making the change.

Shared files, and the rule for each:

| File | Rule |
|---|---|
| `AgentContext.md` | Append-only, to **your** section. Re-read immediately before every append. |
| `.git/index` | Both leaders commit. On `.git/index.lock`, wait 10s and retry (this is a known, expected collision). |

---

## The hard rule: never run the JavaScript test suite

**Do not run `npx vitest`, `npm test`, `npx jest`, or `npm run test` — from any directory, ever, including as a "quick check".**

The `server/api` suite runs against a **shared remote database** (`DATABASE_URL_TEST` points at Supabase) and every test file calls `truncateAll()` in `beforeEach`. Leader 1's agents are running that suite continuously. If you start a concurrent run you will truncate their fixtures mid-assertion, and they will spend an hour debugging failures that have nothing to do with their code.

**Your only test command is `pytest`**, and it touches no database:

```bash
cd server/aiml && .venv/bin/pytest -q
```

This is safe to run as often as you like, concurrently with anything Leader 1 does.

---

## Keep the service importable at every commit

Leader 1's Task 4 verification starts your FastAPI service and curls it:

```bash
cd server/aiml && .venv/bin/uvicorn bhaav_aiml.main:app --port 8099
curl -s http://127.0.0.1:8099/health
```

A commit of yours that leaves `bhaav_aiml` un-importable breaks their verification step and they will not know why. TDD already protects you here — **never commit without `pytest -q` passing first**, and that is sufficient.

---

## Sequencing — your four tasks are strictly serial

Do **not** run these in parallel. Task 8 and Task 9 both edit `detectors/grading.py` and `config.py`; concurrent agents would collide in the same regions of the same two files.

```
Task 7  simulate.py — dated rate series
   │    (unblocks D3, D10, D12 — they were unreachable on ANY dataset before this)
   ▼
Task 8  grading.py — implement D10 (change-point)
   │
   ▼
Task 9  grading.py — implement D12 (offers that never learn)
   │
   ▼
Task 10 evaluate.py — recall, precision, alert budget, baseline
        (needs 7, 8 and 9 landed, or its recall assertion fails legitimately)
```

Your parallelism comes from running **at the same time as Leader 1**, not from running your own tasks concurrently. That is by design and it is fine — the two subsystems are genuinely independent.

---

## How to dispatch your coding agents

One fresh subagent per task, in order, with your review between each. Do not give a subagent more than one task.

**Model assignment:**

| Task | Model | Why |
|---|---|---|
| 7 | **Sonnet** | Restructures a generator and adds a point-in-time rate lookup; needs judgment about the existing code |
| 8 | **Sonnet** | Real algorithm — windowed change-point detection |
| 9 | **Sonnet** | Real algorithm — two-condition conjunction with an exoneration path |
| 10 | **Sonnet** | New module, scoring semantics, must not loosen its own assertions |

Use **Haiku** only if you decide to split a task into a mechanical sub-step (for example, "add these four threshold keys to `config.py`"). None of these four tasks is mechanical enough for Haiku end-to-end — each contains logic where a wrong shortcut passes the test but breaks the meaning.

**Every subagent prompt must carry:**

1. The **full task text** from the plan, copied verbatim — its steps contain complete code, and a subagent that has to guess will invent something plausible and wrong.
2. This ownership line: *"You may only create or modify files under `server/aiml/`. You must never run `npx vitest`, `npm test`, or `npx jest` — another agent is using the shared test database. Your only test command is `cd server/aiml && .venv/bin/pytest -q`."*
3. The Global Constraints block from the top of the plan file — in particular **stdlib-only maths** (no numpy/scipy/sklearn/torch; `requirements.txt` must stay fastapi/uvicorn/pytest/httpx, because that pin is the structural evidence behind the project's "we trained no model" claim) and **thresholds live in `config.py`, never inline in a detector**.
4. An instruction to follow TDD exactly as the steps are written: write the failing test, **run it and confirm it fails for the stated reason**, then implement.

---

## Review gate between tasks

Before dispatching the next task, verify the last one yourself — do not take the subagent's report at face value:

```bash
cd server/aiml && .venv/bin/pytest -q          # 0 failures
git -C "/Users/solminde/Developer/Personal/SIH(2026)" status --short   # nothing outside server/aiml/
git -C "/Users/solminde/Developer/Personal/SIH(2026)" log --oneline -1
```

Reject and re-dispatch if any of these is true:

- A file outside `server/aiml/` was touched.
- A test assertion was weakened to make it pass. **Task 10's recall threshold in particular: if `test_evaluate_catches_the_planted_bad_actors` fails, that is a finding about the detectors, not a reason to lower `0.66`.** Print `eval_report(...)` and read which detector should have fired.
- A dependency was added to `requirements.txt`.
- A threshold was hardcoded inside a detector instead of added to `config.py`.
- `pytest` was not actually run.

---

## Two known traps in your tasks

**Task 8 — `D10_step` is currently `3.0` and can never fire.** A downgrade rate is bounded at `1.0`, so the step between two windows cannot exceed `1.0`. D10 was doubly dead: stubbed *and* mis-thresholded. The task corrects it to `0.30`. If a subagent leaves it at `3.0`, the detector still never fires and the test fails for a reason it will misdiagnose.

**Task 9 — D12 must exonerate `honest_low_grade`.** The whole point is the separating equilibrium: an honest low-grade recycler declares what they are by *lowering their published rate*, and a liar cannot follow because the high rate is what wins them the lot. A D12 that flags on the gap alone will flag the honest recycler too, which is precisely the false positive this design exists to prevent. Both conditions must hold together.

---

## Your entry in AgentContext.md

Re-read the file, then append this section (adjust as you go):

```markdown
## Leader 2 — server/aiml orchestrator
**Focus:** Plan `2026-09-06-make-detectors-real.md`, tasks 7-10 — simulator rate history, D10, D12, evaluation harness
**Owns:** `server/aiml/**` exclusively
**Never runs:** any JS test command — the server/api suite shares one remote database with @Leader1

- 2026-09-06 — Claimed tasks 7, 8, 9, 10. Dispatching serially; T8 and T9 both edit detectors/grading.py and config.py so they cannot overlap.
```

Log each task as it lands, and finish with:

```markdown
- 2026-09-06 — ✅ Done. Files touched: [list]. Merge notes: [anything @Leader1 needs].
```

---

## The join point

When your four tasks are green, post this in `AgentContext.md` and tell the user:

```markdown
- 2026-09-06 — ⚠️ @Leader1: aiml tasks 7-10 complete, pytest green. The detector
  service is ready for your Task 4 end-to-end check on :8099.
```

Leader 1 owns the plan's final **Verification** section — the cross-subsystem run. Do not attempt it yourself; it requires the JS test suites and the shared database you must not touch.

---

## If you are blocked

Do not improvise across the boundary. Append a `⚠️ @Leader1` note to `AgentContext.md` describing exactly what you need, tell the user, and continue with any of your remaining tasks that are not blocked.
