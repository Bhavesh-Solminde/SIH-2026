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
