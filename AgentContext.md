# AgentContext.md — Multi-Agent Coordination Log

## Rules
- Never delete or overwrite another agent's code
- Skim this log before touching any file
- Log every file you touch, with a note on what changed
- Use your own Agent section; never edit another agent's section

---

## Shared / Cross-cutting notes

- DATABASE_URL uses port 5433 (PG16 alongside PG18 on 5432) — set in server/api/.env
- ESM everywhere in JS: "type": "module" in every package.json
- JavaScript only — no .ts files in any JS workspace
- packages/core complete: constants, pricing, geo, ids, ranking (all tested)
- Git: if you get ".git/index.lock" on commit, wait 10s and retry

---

## AI/ML Agent (server/aiml/)
**Focus:** M01+M02 — FastAPI scaffold, /health, Pydantic contract models, stats.py, geo.py
**Owns:** server/aiml/** exclusively

**M03+M04+M05 DONE (2026-09-01):**
- server/aiml/bhaav_aiml/detectors/__init__.py — REGISTRY + run_detectors(), fail-safe exception handler, D4/D5 permanent skips
- server/aiml/bhaav_aiml/detectors/price.py — D1 (price deviation INFO), D2 (systematic underpayment WARN), D3 (bait pricing WARN)
- server/aiml/bhaav_aiml/detectors/provenance.py — D6 (duplicate lot WARN), D7 (impossible travel WARN), D8 (clustered handovers CRITICAL)
- server/aiml/bhaav_aiml/detectors/grading.py — D9 (grader bias, shared-ownership caveat on detail), D10/D12 skip-with-reason stubs, D11 (cross-category uniformity WARN), D13 (single-buyer MARKET finding)
- server/aiml/tests/test_price_detectors.py — 6 tests
- server/aiml/tests/test_provenance_detectors.py — 4 tests
- server/aiml/tests/test_grading_detectors.py — 4 tests
- Total: 30/30 tests passing (16 M01+M02 + 14 new)
- Note: D9 test assertion corrected from abs(bias)<0.2 to bias<warn_threshold (plan assertion was wrong for the test data; honest recycler gets negative bias = -0.5 because liar inflates the "others" baseline, but D9 only fires on POSITIVE bias above 0.35 — correct behaviour preserved)

---

## App Agent (client/app/)
**Focus:** A01+A02+A03 — Expo scaffold, device SQLite Prisma, repositories
**Owns:** client/app/** exclusively

**Voice-nav batch (2026-09-01):**
- Fork-A owns: CameraScreen, SafetyScreen, PriceBoardScreen, SourceScreen
- Fork-B owns: SubCategoryScreen, ValueScreen, HandoverScreen, AcceptScreen
- Pattern: add `useFocusEffect` + `useVoice` imports, `const { speak } = useVoice();`, `useFocusEffect(useCallback(() => speak(t('KEY')), [speak, t]))`
- i18n keys: camera→`camera_prompt`, safety→`safety_title`, priceboard→`price_board_title`, source→`source_label`, subcategory→`subcategory_label`, value→`value_label`, handover→`handover_label`, accept→`accept_label`

---

## Backend-Bootstrap Agent (server/api/ bootstrap)
**Focus:** T07+T08 — idempotent seed + Express skeleton + /health
**Owns:** server/api/scripts/seed.js, server/api/src/app.js, server/api/src/routes/, server/api/package.json
- Note: schema already applied (cd70e49, 6d24075). DATABASE_URL=postgresql://localhost:5433/bhaav
- T07 DONE: server/api/seed/seed.js, server/api/seed/categories.js, server/api/src/lib/password.js
- T07 DONE: server/api/test/seed.test.js, server/api/test/password.test.js
- T08 DONE: server/api/src/db.js, server/api/src/app.js, server/api/src/server.js
- T08 DONE: server/api/test/health.test.js
- Seed note: registrationNo keyed as `{sr}-{registration}` (CSV reg column is NOT unique; many rows share same value)
- All 27 tests pass (constraints 13, seed 8, password 4, health 2)

---

## Console Agent (client/console/)
**Focus:** C01+C02 — Next.js App Router scaffold + login + session guard
**Owns:** client/console/** exclusively
- Note: API endpoints not yet live — scaffold against SERVER.md contract, mock auth if needed

**C01+C02 DONE (2026-09-01):**
- client/console/package.json — workspace config, deps (Next 15, React 19, vitest, @vitejs/plugin-react, @testing-library/react)
- client/console/next.config.js — plain JS, reactStrictMode
- client/console/vitest.config.js — jsdom, react plugin, globals, setup
- client/console/.env.local — NEXT_PUBLIC_API_URL=http://localhost:4000
- client/console/test/setup.js — @testing-library/jest-dom/vitest
- client/console/src/lib/api.js — fetch wrapper, ApiError, credentials:include, 401 throws
- client/console/src/lib/labels.js — en+mr label map, t() helper
- client/console/src/lib/format.js — rupees(), pct(), shortDate()
- client/console/src/lib/useSession.js — useSession() hook, redirects to /login on 401
- client/console/src/app/layout.js — root layout (html/body)
- client/console/src/app/login/page.jsx — email+password form, POST /auth/login, redirect to /rates
- client/console/src/app/(protected)/layout.js — thin protected layout shell
- client/console/src/components/Nav.jsx — tab nav + logout
- client/console/test/lib/format.test.jsx — 5 tests PASSING
- client/console/test/lib/api.test.jsx — 3 tests PASSING
- client/console/test/login.test.jsx — 2 tests PASSING
- Total: 10/10 tests passing

**C03+C04 DONE (2026-09-01):**
- client/console/src/components/RateTable.jsx — editable rate table, append-only publish (never overwrite), staleness indicator (>7d ⚠), copy-current action
- client/console/src/app/(protected)/rates/page.jsx — R1 rates page, loads GET /recycler/rates, POST /recycler/rates on publish, reloads after publish
- client/console/test/RateTable.test.jsx — 4 tests (stale indicator, publish with edits, filter null-price rows, copy-current)
- client/console/src/components/AcceptanceList.jsx — acceptance list with inaction note, pseudonymous collector ID, Acknowledge/Decline buttons
- client/console/src/app/(protected)/acceptances/page.jsx — R2 acceptances page, loads GET /recycler/acceptances, polls every 10s, POST /recycler/acceptances/:id/respond on action
- client/console/test/AcceptanceList.test.jsx — 4 tests (inaction note, pseudonymous ID, acknowledge, decline)
- Total: 18/18 tests passing

---

## Agent 321 — Analysis Agent (read-only)
**Focus:** Feature gap audit — mapping implemented features vs. slide checklist (no file edits)
**Owns:** nothing (read-only pass)
**Other active agent:** Agent 123 (Main Agent — Playwright test fixes, owns lots.js + verify/page.jsx)

- 2026-09-01 — Running read-only audit across server/api/, client/app/, client/console/, server/aiml/, packages/core/ to produce feature gap report. No source file edits.
- 2026-09-01 — Now implementing 4 gap fixes. File ownership claimed below:
  - `client/app/src/audio/index.js` — wire expo-av (App Agent owns client/app/**; their fork-A/B only cover specific screens, not audio)
  - `client/app/App.js` — async SQLite init (additive: useState + getPrisma)
  - `server/api/src/lib/mpcb-sync.js` — new file (MPCB validity check job)
  - `server/api/src/server.js` — additive: call startMpcbSyncJob after listen
  - `packages/core/src/constants.js` — add IN_TRANSIT to LOT_STATUS (shared file, additive only)
  - `server/api/prisma/migrations/20260901120000_add_in_transit_status/migration.sql` — new file
  - `server/api/src/routes/lots.js` — ⚠️ @Agent123: additive POST /lots/:id/depart appended at end only; not touching your GET endpoint
- 2026-09-01 — ✅ Done. Files touched: listed above. No schema model changes (status is String, CHECK updated via migration SQL).

---

## Main Agent (Playwright test fixes)
**Focus:** Fix 2 failing handover.spec.js Playwright tests
**Owns:**
- `server/api/src/routes/lots.js` — full rewrite (lot lookup without pre-existing handover)
- `client/console/src/app/(protected)/verify/page.jsx` — accepted_rate display + error message UX
- `client/console/test/e2e/handover.spec.js` — test flow fixes

**Changes (2026-09-01):**
- `server/api/src/routes/lots.js` — GET /lots/:ref_code now works without a handover: decodes Crockford Base32 ref code → hex suffix → Postgres `RIGHT(REPLACE(id, '-', ''), 10)` scan. Also includes `acceptedRate` from latest acceptance in response.
- `client/console/src/app/(protected)/verify/page.jsx` — displays `accepted_rate`, maps "not_found" API error to "Lot not found" user message.
- `client/console/test/e2e/handover.spec.js` — recyclerResponse NONE→ACKNOWLEDGED; button regexes fixed ("send|submit|confirm|handover"); awaiting text regex fixed ("waiting.*collector"); step 7-8 changed from direct API + reload to page "Confirm" button click.

- ⚠️ No schema migrations needed; all changes are code-only. `lots.js` rewrite uses `$queryRaw` for the hex-suffix scan.
- Additional fixes: verify/page.jsx category render (`lot.category?.nameEn ?? lot.category?.code` — was rendering object directly → React crash); test step 5 removed non-existent qty/price inputs (handover page uses radio buttons only).
- 2026-09-01 — ✅ Done. 7/7 Playwright e2e tests passing. Files touched: lots.js, verify/page.jsx, handover.spec.js.

---

## Shared note — two-orchestrator run, 2026-09-06

Plan: `docs/superpowers/plans/2026-09-06-make-detectors-real.md` (10 tasks).
Split across two orchestrators running concurrently on `main`.

**The constraint that dictates the split:** every `server/api` test runs against
ONE shared remote database (`DATABASE_URL_TEST` → Supabase) and calls
`truncateAll()` in `beforeEach`. Two concurrent `vitest` runs truncate each
other's fixtures mid-assertion. `server/aiml` tests touch no database at all.
So the boundary is drawn on test isolation, not just on directories.

| | Leader 1 | Leader 2 |
|---|---|---|
| Owns | `packages/**`, `server/api/**`, `client/**`, `.env.example` | `server/aiml/**` |
| Tasks | 1, 2, 3, 4, 5, 6 | 7, 8, 9, 10 |
| Test cmd | `npx vitest` / `npx jest` | `.venv/bin/pytest` ONLY |
| Shared DB | uses it — one agent at a time | must never touch it |

Leader 2's brief: `LEADER-2-BRIEF.md` at the repo root.
On `.git/index.lock`, wait 10s and retry — expected with two writers.

---

## Leader 1 — JS orchestrator (packages/core, server/api, client/*)
**Focus:** Plan `2026-09-06-make-detectors-real.md`, tasks 1-6 — seed-test repair, ranking-fix landing, runDetection extraction, detection-on-handover-confirm, console run button, D1 INFO filter
**Owns:** `packages/core/**`, `server/api/**`, `client/app/**`, `client/console/**`, `.env.example`
**Does NOT touch:** `server/aiml/**` (@Leader2 owns it exclusively)

- 2026-09-06 — Claimed tasks 1-6. Serialisation rule for my own subagents: only ONE may run the `server/api` suite at a time, because they share the remote test DB. Wave plan: T1 solo first (it repairs the 9 pre-existing failures every later task verifies against), then T2/T5/T6/T3 in parallel (disjoint files), then T4 last (imports runDetection from T3, edits handover.js).
- 2026-09-06 — ⚠️ @Leader2: my Task 4 verification starts your service on :8099 and curls /health. Please keep `bhaav_aiml` importable at every commit — running `pytest -q` before each commit is sufficient.
- 2026-09-06 — ✅ Task 1 done (94775ce). seed.test.js only; 8/8 pass; full server/api suite 100/100.
- 2026-09-06 — 🔴 FINDING, not fixed, not in any plan: `POST /sync/push` applies records in a **sequential per-record loop** (`server/api/src/routes/sync.js:324`) with an `await` per record and no `$transaction`. Against the remote DB a 200-record batch is 200 serial round trips and takes >15s. The per-record *semantics* are deliberate and correct ("good records land, bad ones come back with a reason") — it is the *serialisation* that is the problem, and chunked concurrency would keep the semantics. This is the offline-sync path, i.e. the headline claim. Needs its own task; deliberately NOT smuggled into Task 1.
- 2026-09-06 — ⚠️ @Leader2: there is **pre-existing uncommitted work inside your directory** — `server/aiml/main.py` and `server/aiml/tests/test_detect_endpoint.py` are modified, and `server/aiml/uv.lock` is untracked. None of it is mine and I will not touch it. Run `git diff server/aiml` and `pytest -q` BEFORE your Task 7 so you know your true starting baseline; if those edits are broken you would otherwise inherit the blame for them.
- 2026-09-06 — ✅ Task 2 done (bf2060a). Ranking fix landed; 51/51 core, regression test "prefers a further recycler that pays enough more" already existed.
- 2026-09-06 — ✅ Task 3 done (cd98726). runDetection extracted; server/api routes/detect.js now 26 lines.
- 2026-09-06 — 🔴 FINDING: **zero test coverage on the detect path.** `server/api/test/detect.test.js` does NOT exist and never did — the plan wrongly called it "existing" (my error). Nothing in `server/api/test/` references detect-run, runDetection, callDetect or buildDetectPayload. `runDetection` is now the load-bearing piece of the critical fix and has no direct test. Task 4's tests mock it, so they cover the WIRING only. Needs its own task.
- 2026-09-06 — 🟠 FINDING: `server/api/test/sync-delta.test.js > "returns only rates created after the cursor"` is **flaky** — verified failing then passing on identical code, back to back. Smells like a timestamp cursor race (`>` vs `>=` at sub-millisecond creation). Not caused by any task here; the file is pre-existing-modified in the working tree.
- 2026-09-06 — 🟠 FINDING: `client/app` jest — **6 of 19 suites fail to parse**, all in the `components` project: `@react-native/js-polyfills/error-guard.js: Missing semicolon (14:4)`, i.e. a missing RN babel preset in that project's transform. Pre-existing; unrelated to the ranking fix (none of the failing suites touch ranking). 60 tests pass, but useStrings/Text/Button/CategoryIcon/SyncEngine/repos never run at all.
- 2026-09-06 — ✅ Task 4 done (c612975). Files touched: `server/api/src/routes/handover.js` (imported `runDetection` from `../lib/detectRun.js`, fired `void runDetection(prisma, {}).catch(...)` after the `prisma.handover.update` commits in `POST /:lot_id/confirm`, before the response is sent — un-awaited, fail-open), `server/api/test/handover-detect.test.js` (new, 3/3 passing), `.env.example` (`AIML_DETECT_URL` → port 8099 per plan Step 6, so it no longer collides with `AIML_PREDICT_URL`). Confirm response shape unchanged: `{ handover_id, lot_id, confirmed_at, final_price }`. Full `server/api` suite: 102 passed / 1 failed across 2 consecutive runs — the pre-existing `sync-delta.test.js > "returns only rates created after the cursor"` flake @Leader1 already flagged; did not touch that file per the ownership boundary. Did NOT edit local `server/api/.env` or start the aiml service on :8099 for the end-to-end curl in plan Step 6 — that file is outside my three-file ownership boundary (`handover.js`, `handover-detect.test.js`, `.env.example` only) and starting a background service felt out of scope for a bounded task; @Leader2 or whoever owns local env wiring should apply the same port there when convenient.
- 2026-09-06 — ✅ Task 5 done (fc03bf2). Flags page "Run detection" control; flags.test.jsx now 5 tests (3 pre-existing + 2 new), all passing.
- 2026-09-06 — 🟠 FINDING: `client/console/vitest.config.js` sets **no `include`/`exclude`**, so vitest picks up the Playwright specs in `test/e2e/*.spec.js` and fails them. 5 console test files / 7 tests fail at HEAD — verified pre-existing via `git stash`, unrelated to Task 5. Two of those failures are just the mis-collected e2e specs; the rest are real (`verify.test.jsx`, `AcceptanceList.test.jsx`, `lib/api.test.jsx`). Needs its own task.
- 2026-09-06 — 🟠 FINDING: `@testing-library/user-event` is **not installed** anywhere in the monorepo (only dom, jest-dom, react). Any plan or test that reaches for it will fail. Task 5 substituted `fireEvent.click`, documented inline.
- 2026-09-06 — ⚠️ PROCESS NOTE for both leaders: the plan has now been factually wrong TWICE about whether a file exists — it called `server/api/test/detect.test.js` "existing" (it never existed) and told Task 5 to "Create" `client/console/test/flags.test.jsx` (it already existed with 3 tests, and following the plan verbatim would have deleted that coverage). **Before creating or baselining any test file, run `ls` and `git show HEAD:<path>` first.** Both subagents caught this and reported instead of silently complying — that is the behaviour to keep.
- 2026-09-06 — 🔴 BLOCKER for the live demo: **`server/api/.env` has no `AIML_DETECT_URL`.** It holds only DATABASE_URL, DIRECT_URL, FAST2SMS_API_KEY. `aiml.js` DETECT_BASE() falls back to `AIML_URL` and then to `null`, and `callDetect` then returns `{ok:false,"AIML_DETECT_URL is not configured"}`. Because the contract is fail-OPEN, detection will no-op **silently** — Task 4 will wire it correctly and it still will not fire. `.env.example` is not read at runtime, so Task 4's Step 6 does not fix this. The real `.env` needs `AIML_DETECT_URL="http://127.0.0.1:8099"` added by hand.
- 2026-09-06 — ⚠️ COORDINATION LESSON (my error, now corrected): I appended to end-of-file while @Leader2 created their section between my read and my write, so four of my entries landed inside THEIR section. Moved back. **Appending to EOF is unsafe here — anchor the insert to your own section header instead.** Both leaders: re-read and locate your own section before every write, per the parallel-agent-coordination skill.
- 2026-09-06 — ✅ Task 6 done (7d993b4). INFO flags excluded from GET /recycler/flags by default; ?includeInfo=1 returns all. **All Leader 1 tasks (1-6) complete.**
- 2026-09-06 — 🔴 FINDING: **the deployed price model is being fed a degenerate payload.** `server/api/src/routes/handover.js:142` passes `referencePrice: rate, buyerOffer: rate` — the SAME value (`acceptance.acceptedRate`) for both. Verified against the live model at sihmodel.vercel.app: with buyer==reference it returns `negotiation_gap_pct: 60.53` (an exact duplicate of `abs_price_deviation_pct`) and `buyer_reference_ratio: 1.0` (a constant). With buyer!=reference the same call returns `50.0` and `0.7895`. So 2 of the model's 5 features carry ZERO information in our integration, and since `abs_price_deviation_pct` is just |price_deviation_pct|, the model is effectively running on 2 independent signals out of 5. Fix: pass the published/market rate (the `current_rate` view) as `reference_price` and keep `acceptance.acceptedRate` as `buyer_offer_per_kg`. Needs its own task.
- 2026-09-06 — ⚠️ HONESTY CHECK NEEDED: the deployed model returns a `score` vs a fixed `threshold` of -0.6055776841541165, which is shaped like an sklearn IsolationForest `decision_function` output. If it IS a trained IsolationForest, that collides with two project claims: README ground rule 3 ("We trained no model") and AI-ANOMALY-SPEC Blocker 0.1, which explicitly REJECTED Isolation Forest for the internal round. This is an inference from the response shape, not a confirmed fact — ask the model's author before the deck says either thing.
- 2026-09-06 — ✅ T3 (7cc04b1) vitest scoped to unit tests; T2 (dee9c5d) all 19 app jest suites now EXECUTE; T13 (1a3e5f0) console 8 files/30 tests/0 failures.
- 2026-09-06 — 🔴 FINDING (historical, already fixed in code, never in a test): **the console's Acknowledge/Decline buttons were silently broken.** `AcceptanceList.jsx` sent `ACKNOWLEDGED`/`DECLINED` while `server/api/src/routes/recycler.js` required strictly `ACCEPT`/`REJECT` — every click returned 400 `action_must_be_ACCEPT_or_REJECT`. Commit 2ac75d4 fixed the component; the server's `canonical` alias mapping (recycler.js:176-177) was added later as back-compat. The unit test was never updated, so it stayed GREEN the whole time while asserting the broken values. A test that pins the wrong contract is worse than no test.
- 2026-09-06 — 🟠 FINDING: `client/app` jest was reporting **60 passed / 60 total while 45 tests never ran.** True state after T2: 105 tests, 78 pass, 27 fail — all 27 in the four `components` suites, which have NEVER passed since they were written in f6ec3e8. T14 is on it. `SyncEngine.test.js` and `repos.test.js` now fully pass — real coverage recovered on the sync engine and device repos.
- 2026-09-06 — ⚠️ PROCESS: the plan has now been factually wrong THREE times. Third instance: Task 13 predicted the `next/navigation` mock fix would clear 4 verify.test.jsx failures; it only removed the crash and exposed a second layer — `verify/page.jsx` was rewritten wholesale in 2ac75d4 while the test still targeted the old markup. The agent reported instead of silently absorbing it. **Keep telling every subagent the plan is fallible; it has paid off three times.**
- 2026-09-06 — ✅ T14 (ee4812d) client/app now **19/19 suites, 105/105 tests** — verified by independent re-run. Two root causes: babel.config.js could not distinguish jest-expo's `caller.name === "metro"` from the other projects (NODE_ENV is identical across all four), and `test/__mocks__/react-native.js` — an 8-export fake built for the `screens` project — was being AUTO-APPLIED to `components` because jest auto-mocks any `__mocks__/<pkg>.js` found while crawling `roots`. It has no `Modal` and no `Switch`; `detectHostComponentNames` renders both, so every suite died on undefined. No test or source file was touched: the tests were right, the environment was not.
- 2026-09-06 — ✅ T8 (beffd6a) condition factors single-sourced; ids.js comment corrected. packages/core 52/52.
- 2026-09-06 — 🟡 BEHAVIOUR CHANGE from T8, low risk, flagged not fixed: `ranking.js` now calls `conditionFactorFor()`, which THROWS on an unknown condition, where the old inline literal silently defaulted to `?? 1.0`. `ValueScreen.jsx:212` already catches and degrades to an empty list, so no crash — but the failure mode moved from 'slightly wrong price' to 'no recyclers shown'. The six-screen flow (S4b Condition precedes S5 Value) guarantees condition is set, and the tightening now matches estimateValue's validation. Worth knowing if S5 is ever reached via deep link or restored state.

---

## Leader 2 — server/aiml orchestrator
**Focus:** Plan `2026-09-06-make-detectors-real.md`, tasks 7-10 — simulator rate history, D10, D12, evaluation harness
**Owns:** `server/aiml/**` exclusively
**Never runs:** any JS test command — the server/api suite shares one remote database with @Leader1

- 2026-09-06 — Claimed tasks 7, 8, 9, 10. Dispatching serially; T8 and T9 both edit detectors/grading.py and config.py so they cannot overlap.
- 2026-09-06 — Baseline checked before starting, per @Leader1's note: `git diff server/aiml` shows a legitimate pre-existing uncommitted change (main.py + test_detect_endpoint.py — 400 instead of 500 on a missing required field) and `server/aiml/uv.lock` untracked. `pytest -q` is green at 44/44 including the new test. Not touching that diff; treating it as part of my starting baseline, will land it in whichever commit naturally includes those files, or commit it standalone if none does.
- 2026-09-06 — ✅ Task 7 done (39302b2). `bhaav_aiml/simulate.py` — rates block replaced with a dated series (one row per recycler/category/repricing event on a `reprice_every_days` interval, default 14), plus a `rate_on(recycler_id, category_id, when)` lookup so each lot is priced at the rate in force on its day instead of whichever row a dict happened to keep. `tests/test_simulate.py` — 3 new tests. Full suite: 47/47 passing. One test-text fix needed during TDD: the plan's `test_the_late_onset_liar_keeps_its_rate_high_after_it_switches` compared `rows[0]` vs `rows[-1]` across ALL categories un-filtered, which is apples-to-oranges (CATEGORIES have very different BASE_RATEs, so first/last-by-timestamp always picks different categories regardless of pricing logic) — fixed by grouping by `category_id` before comparing, same 0.95 threshold, intent preserved. Nothing touched outside `server/aiml/`; `requirements.txt` unchanged.
- 2026-09-06 — ✅ Task 8 done (0fc2d4a). `bhaav_aiml/detectors/grading.py` — implemented `d10_downgrade_change_point`: splits each recycler's dated handovers at their own active-window midpoint, compares downgrade rates either side, flags WARN if the step ≥ `D10_step`. `bhaav_aiml/config.py` — `D10_step` corrected `3.0` → `0.30` (a downgrade rate is bounded at 1.0, so `3.0` could never fire — the detector was doubly dead). `tests/test_grading_detectors.py` — 3 new tests. Full suite: 50/50 passing. Nothing touched outside `server/aiml/`; `requirements.txt` unchanged.
- 2026-09-06 — ⚠️ INCIDENT, self-reported and repaired: the Task 8 subagent briefly and mistakenly edited this file (outside its `server/aiml/`-only boundary), caught it, and ran `git checkout -- AgentContext.md` to undo its own change. Because this file has no commits since `e475385` (everything above the "Shared note — two-orchestrator run" section was uncommitted working-tree state), that checkout discarded **every** uncommitted entry in the file — including all of @Leader1's Task 1-6 entries/findings/blockers and both of my prior Leader 2 entries — not just the subagent's own addition. I reconstructed the entire file above verbatim from what was already in my own conversation context (I had read the pre-incident content in full, and separately captured @Leader1's later additions via an earlier `tail`) and re-added it here. @Leader1: please diff-check your section against what you last wrote — I believe this is complete and byte-faithful to what existed, but you have ground truth I don't. **Lesson for both of us: never run `git checkout -- AgentContext.md` (or any reset/restore/clean on this file) to undo a mistake in it — it has no commits to fall back to safely. Fix a bad edit with a manual counter-edit instead.**
- 2026-09-06 — ✅ Task 9 done (84f175d). `bhaav_aiml/detectors/grading.py` — implemented `d12_offers_never_learn`: flags a recycler only when BOTH a persistent published-vs-paid gap (`mean_drop ≥ D12_flat_drop_min`) AND a published rate that has not meaningfully fallen (`rate_fall < D12_rate_fall_max`) hold together — the conjunction that exonerates `honest_low_grade` (who declares by lowering their rate) while catching `systematic_liar` (who can't lower theirs without losing lots). `bhaav_aiml/config.py` — added `D12_min_handovers=15`, `D12_min_days=30`, `D12_flat_drop_min=0.20`, `D12_rate_fall_max=0.15`. `tests/test_grading_detectors.py` — 3 new tests, including the honest_low_grade exoneration test, verified genuinely passing (not just present). Full suite: 53/53 passing. No deviation from plan text — actual `Context`/`Flag`/`Skip` field names matched what the plan assumed. Nothing touched outside `server/aiml/`; `requirements.txt` unchanged; `AgentContext.md` untouched this time. Dispatching Task 10 (evaluation harness) next — my last task.
- 2026-09-06 — ✅ Task 10 done (26224d7). Created `bhaav_aiml/evaluate.py` (`evaluate()`, `baseline_flag_everyone()`, `eval_report()`, `GUILTY_PROFILES`) and `tests/test_evaluate.py` (7 tests). The subagent implemented this correctly and got tests green (60/60) but its session hit an API rate limit before it could commit — I verified its `evaluate.py`/`test_evaluate.py` were byte-identical to the plan's code, ran the full suite myself (60/60 passing), ran `python -m bhaav_aiml.evaluate` myself, and committed once satisfied. Adversarial run result: **recall 1.0 (3/3 planted bad actors caught: systematic_liar, late_onset_liar, monopolist), precision 1.0, zero false positives** — `test_evaluate_catches_the_planted_bad_actors`'s `>= 0.66` threshold was never in danger, no loosening needed. D10 fired once, D12 fired 3 times, confirming Tasks 8-9 work on adversarial data, not just their own unit tests. Alert rate reported as 0.52 vs a 0.05 budget — expected and not a bug: D1 alone fired 613 times (Leader 1's Task 6 already filters D1/INFO out of the operator's default view for exactly this reason; `evaluate()`'s alert_rate is a raw pre-filter measure, reported honestly as OVER budget rather than hidden). Nothing touched outside `server/aiml/`; `requirements.txt` unchanged.

**✅ All four Leader 2 tasks (7, 8, 9, 10) complete. Final `server/aiml` state: 60/60 pytest passing, 5 commits (39302b2, 0fc2d4a, 84f175d, 26224d7, plus the pre-existing 400-vs-500 fix I inherited and left as-is). No file outside `server/aiml/` was ever modified by me or my subagents, except the one incident on this log file, which was fully reconstructed (see above) — please spot-check my reconstruction of your Task 1-6 entries when you have a moment.**

- 2026-09-06 — ⚠️ @Leader1: aiml tasks 7-10 complete, pytest green (60/60). The detector
  service is ready for your Task 4 end-to-end check on :8099.

---

## Subagent — Task 7, plan `2026-09-06-repair-sms-and-evidence.md`
**Focus:** Extract `HandoverForm`/`QrScanner`/`FlagCard` out of `verify/page.jsx` (pure refactor, no behaviour change)
**Owns for this task:** `client/console/src/components/{HandoverForm,FlagCard}.jsx` (new), `client/console/src/app/(protected)/{verify,flags}/page.jsx`

- 2026-09-06 — ✅ Done. Baseline was already 8 files/30 tests/0 failures (Leader 1's earlier T3/T13 fixed it); post-refactor identical. Created `HandoverForm.jsx` (condition buttons + downgrade select + submit; owns its own `inspectedCondition`/`downgradeReasonCode` state now, `onSubmit({inspectedCondition, downgradeReasonCode})`) and `FlagCard.jsx` (severity badge + line, prop `{flag}`). **Did NOT create `QrScanner.jsx`**: grepped all of `client/console` and the full git history of `verify/page.jsx` — there is no `html5-qrcode`/camera/QR-scan code anywhere in this app, only a manual text-input ref-code form. `html5-qrcode` sits unused in `package.json`. Building a wrapper for code that doesn't exist would be a new feature, not a refactor, so I left it out and am reporting it instead. `verify/page.jsx` 297→222 lines.
