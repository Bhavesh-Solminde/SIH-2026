# Make The Detectors Real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the eleven pattern detectors actually fire in a deployed configuration, make their output measurable, and get the test suite green — so the AI/ML claim is demonstrated rather than asserted.

**Architecture:** Detection currently exists only behind `POST /detect-run`, an authenticated route that nothing calls. This plan extracts the run logic into a reusable `runDetection()`, fires it fail-open after every confirmed handover, adds an operator-triggered button, then fixes the three detector-quality gaps found by adversarial simulation (D1 alert-budget breach, D10/D12 permanently stubbed, simulator unable to emit rate history) and adds the missing evaluation harness.

**Tech Stack:** Node 22 + Express + Prisma + Postgres (`server/api`), Python 3.13 + FastAPI + stdlib-only maths (`server/aiml`), Next.js 15 App Router (`client/console`), Vitest (JS), pytest (Python).

## Global Constraints

- **ESM everywhere in JS.** `"type": "module"` in every package.json. All relative imports carry a `.js` extension.
- **JavaScript only** in JS workspaces — no `.ts` files.
- **Python: standard library only** for detector maths. No numpy, scipy, sklearn, torch. `server/aiml/requirements.txt` stays fastapi/uvicorn/pytest/httpx — this pin is the structural evidence for the README's "we trained no model" ground rule and must not be broken.
- **Fail-open is absolute.** A detector or ML outage must never block a sale, an acceptance, or a handover. Every call into `server/aiml` returns `{ ok: false, reason }` rather than throwing.
- **Thresholds are configuration, not code** (`AI.md` §5 rule 4). Every new tuneable goes in `server/aiml/bhaav_aiml/config.py::THRESHOLDS`, never inline in a detector.
- **`CONFIG_VERSION` is recorded on every flag** so no past decision is inexplicable.
- **Simulated data is labelled simulated**, on screen and in the deck, every time (`README.md` ground rule 2). `simulate()` must never drop `"simulated": True`.
- **Detectors D4 and D5 stay out of scope** — blocked on real per-category weight distributions that do not exist. They skip with a reason. Do not implement them.
- **The API test suite shares one remote database.** `server/api/vitest.config.js` sets `fileParallelism: false` + `singleFork` — do not change this. `DATABASE_URL_TEST` points at Supabase, so every round trip is network-bound.
- **Never break `POST /sync/push` or `POST /handover/:lot_id/confirm`.** They are the offline claim and the two-sided signature — the two things being demonstrated.
- Conventional commit messages.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `server/api/test/seed.test.js` | Seed assertions against a shared remote DB | Modify — restructure fixtures |
| `server/api/test/sync-push.test.js` | Sync push contract incl. 200-record batch | Modify — timeout only |
| `server/api/src/lib/detectRun.js` | Reusable detection run: build payload → call aiml → persist flags | **Create** |
| `server/api/src/routes/detect.js` | Thin HTTP wrapper over `runDetection` | Modify — becomes thin |
| `server/api/src/routes/handover.js` | Two-sided handover; fires detection after confirm | Modify — add fire-and-forget |
| `server/api/src/routes/recycler.js` | `GET /recycler/flags`; excludes INFO by default | Modify — severity filter |
| `client/console/src/app/(protected)/flags/page.jsx` | Flags list + operator "Run detection" control | Modify |
| `server/aiml/bhaav_aiml/simulate.py` | Seeded synthetic history incl. dated rate series | Modify — rate history |
| `server/aiml/bhaav_aiml/detectors/grading.py` | D9–D13; D10 becomes a real change-point test | Modify — implement D10 |
| `server/aiml/bhaav_aiml/detectors/price.py` | D1–D3; D12 trend test lives with the price series | Modify — implement D12 |
| `server/aiml/bhaav_aiml/evaluate.py` | Recall, alert budget, separation, baseline | **Create** |
| `server/aiml/tests/test_evaluate.py` | Evaluation harness tests | **Create** |

`runDetection` is extracted rather than left in the route because two callers now need it (the route and the handover confirm path), and a route handler cannot be called from another route handler. `evaluate.py` is a module, not a script, so its numbers are assertable in tests rather than eyeballed in a terminal.

---

### Task 1: Fix the seed test suite

The 8 seed failures are a test-design bug, not a performance bug. `beforeEach(truncateAll)` combined with `await seedAll(prisma)` inside every `it` means the 161-recycler corpus is written **8 times per run** against a remote Supabase database. Every one of those exceeds the 15s timeout. All 8 assertions are read-only, so the corpus should be built once.

**Files:**
- Modify: `server/api/test/seed.test.js:1-9` (fixtures) and the `await seedAll(prisma);` line inside each `it`

**Interfaces:**
- Consumes: `seedAll(prisma)` from `server/api/seed/seed.js`; `prisma`, `truncateAll` from `server/api/test/helpers/db.js`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Run the suite to confirm the current failure**

Run: `cd server/api && npx vitest run test/seed.test.js --reporter=verbose`

Expected: 8 failures, each `Test timed out in 15000ms`.

- [ ] **Step 2: Replace the fixture block**

Replace `server/api/test/seed.test.js` lines 1-9 with:

```js
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, truncateAll } from "./helpers/db.js";
import { seedAll } from "../seed/seed.js";

// seedAll writes 161 recyclers, 16 categories, 3 condition factors and 3 console
// accounts. DATABASE_URL_TEST points at a REMOTE database (see test/setup.js), so
// every one of those writes is network-bound. The previous shape —
// beforeEach(truncateAll) plus `await seedAll(prisma)` inside each `it` — seeded
// the whole corpus 8 times per run and blew the 15s timeout on all 8.
//
// Every assertion in this file is read-only, so the corpus is built once and
// shared. The one test that genuinely needs a second seed (idempotency) calls
// seedAll itself. Nothing else in this file mutates the corpus; the package runs
// test files serially (fileParallelism: false + singleFork), so no other file can
// truncate it mid-run.
beforeAll(async () => {
  await truncateAll();
  await seedAll(prisma);
}, 120_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
```

- [ ] **Step 3: Remove the per-test seed calls**

Delete the line `await seedAll(prisma);` from the body of each of these tests (it is the first statement in each):

- `loads all 161 MPCB rows`
- `marks exactly 74 of them VALID`
- `creates 8 parent and 8 sub-categories`
- `seeds the three condition factors from DB.md 3.5`
- `creates exactly three console accounts — the three registered buyers`
- `geocodes Eco-Recycling Ltd, the lapsed one nearest the campus`
- `publishes rates only for the three registered buyers`

Leave every `expect(...)` untouched.

- [ ] **Step 4: Rewrite the idempotency test so it still re-seeds**

Replace the whole `is idempotent — running it twice changes no count` test with:

```js
  // This is the one test that must run seedAll a second time — that is the
  // behaviour under test. It runs on top of the beforeAll corpus, which is
  // exactly the "twice" the name describes.
  it("is idempotent — running it twice changes no count", async () => {
    const before = {
      recyclers: await prisma.recycler.count(),
      categories: await prisma.category.count(),
      accounts: await prisma.recyclerAccount.count(),
    };

    await seedAll(prisma);

    expect(await prisma.recycler.count()).toBe(before.recyclers);
    expect(await prisma.category.count()).toBe(before.categories);
    expect(await prisma.recyclerAccount.count()).toBe(before.accounts);
  }, 60_000);
```

- [ ] **Step 5: Run the seed suite and verify it passes**

Run: `cd server/api && npx vitest run test/seed.test.js --reporter=verbose`

Expected: `8 passed`, total duration well under the old 15s-per-test wall.

- [ ] **Step 6: Investigate the sync-push batch timeout before changing it**

Run: `grep -n "200-record\|200\b" server/api/test/sync-push.test.js`

Then read the test body and the `POST /sync/push` handler in `server/api/src/routes/sync.js`. Answer one question and write the answer into the commit message:

- If the 200 records are applied inside **one** `prisma.$transaction`, the duration is legitimate network latency against a remote DB → apply Step 7.
- If they are applied as **200 separate awaited round trips**, that is a real performance bug in the endpoint, not a test problem. Stop, and record it as a finding — batching it is a separate task and must not be smuggled into this one.

- [ ] **Step 7: Raise only that test's timeout, with the reason in the code**

Only if Step 6 concluded "one transaction". In `server/api/test/sync-push.test.js`, change the 200-record test's signature to carry its own timeout:

```js
  // 200 records in one transaction against the REMOTE test database (see
  // test/setup.js — DATABASE_URL_TEST is Supabase). The 15s package default is
  // tuned for single-row tests; this one is legitimately network-bound. Raising
  // it here rather than globally keeps every other test honest about its speed.
  it("applies a 200-record batch without partial failure", async () => {
    // ...existing body unchanged...
  }, 60_000);
```

- [ ] **Step 8: Run the full API suite**

Run: `cd server/api && npx vitest run --reporter=dot`

Expected: 0 failures.

- [ ] **Step 9: Commit**

```bash
git add server/api/test/seed.test.js server/api/test/sync-push.test.js
git commit -m "test(api): seed corpus once per file instead of once per test

seedAll writes 161 recyclers against a remote database; beforeEach plus a
per-test seed ran it 8 times and timed out on all 8. Every assertion is
read-only, so the corpus is now built in beforeAll. The idempotency test
still seeds a second time, which is the behaviour it exists to check."
```

---

### Task 2: Commit the ranking fix

The inverted ranking is already repaired in the working tree but uncommitted, which makes it untracked risk. The old score used `rateMatch = 1 - |recyclerRate - expectedRate| / max(...)`, which **penalised a recycler for paying more than the collector expected** — the direct cause of recommending a recycler paying 43% less. It is replaced by value-dominant scoring. This task verifies and lands it; it writes no new logic.

**Files:**
- Modify: none (verification only)
- Commit: `packages/core/src/ranking.js`, `packages/core/src/constants.js`, `client/app/src/screens/ValueScreen.jsx`, `client/app/src/screens/AcceptScreen.jsx`

**Interfaces:**
- Produces: `rankRecyclers({ lot, recyclers, rates, from, asOf, weights, sortBy })` returning rows with `{ recyclerId, name, lat, lng, address, unit, unitPrice, value, rateValidFrom, distanceKm, stalenessDays, pickupAvailable, authorizationStatus, materialsAccepted, recommended, score }`. `sortBy` is `"score" | "value" | "distance"`. `RANKING_WEIGHTS = { value: 0.55, distance: 0.30, pickup: 0.10, staleness: 0.05 }`.

- [ ] **Step 1: Confirm no stale references to the removed API survive**

Run: `grep -rn "rateMatch\|collectorExpectedRate" --include="*.js" --include="*.jsx" client server packages | grep -v node_modules`

Expected: **no output.** Any hit is a half-applied refactor — fix it before continuing.

- [ ] **Step 2: Verify the ranking tests assert the new behaviour**

Run: `cd packages/core && npx vitest run test/ranking.test.js --reporter=verbose`

Expected: 12 passed. Read the test names. At least one must assert that a higher-paying recycler outranks a nearer lower-paying one — that is the regression this task protects. If no such test exists, add it before committing:

```js
  it("ranks the higher-paying recycler above a nearer one that pays less", () => {
    const ranked = rankRecyclers({
      lot: { categoryCode: "CABLE", quantity: 10, unit: "KG", condition: "GOOD" },
      recyclers: [
        { id: "near", lat: 19.40, lng: 72.83, authorizationStatus: "VALID",
          materialsAccepted: ["CABLE"], serviceAreaKm: 25, pickupAvailable: false },
        { id: "far",  lat: 19.45, lng: 72.88, authorizationStatus: "VALID",
          materialsAccepted: ["CABLE"], serviceAreaKm: 25, pickupAvailable: false },
      ],
      rates: [
        { recyclerId: "near", categoryCode: "CABLE", price: 220, unit: "KG", validFrom: "2026-09-01T00:00:00Z" },
        { recyclerId: "far",  categoryCode: "CABLE", price: 380, unit: "KG", validFrom: "2026-09-01T00:00:00Z" },
      ],
      from: { lat: 19.39, lng: 72.83 },
      asOf: "2026-09-06T00:00:00Z",
    });

    expect(ranked[0].recyclerId).toBe("far");
    expect(ranked[0].recommended).toBe(true);
  });
```

- [ ] **Step 3: Run every suite the change can reach**

Run: `npx vitest run --reporter=dot`

Expected: 0 failures (Task 1 already cleared the seed and sync-push failures).

Run: `cd client/app && npx jest --silent`

Expected: 0 failures. `ValueScreen` reads `rec.value`; a failure here means the screen was not migrated with the library.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/ranking.js packages/core/src/constants.js \
        client/app/src/screens/ValueScreen.jsx client/app/src/screens/AcceptScreen.jsx
git commit -m "fix(core): rank recyclers by what the collector is paid

The previous score maximised rateMatch — closeness between the recycler's
rate and the collector's expected rate — which penalised a recycler for
paying MORE than expected and could recommend one paying 43% less. FLOW.md
promises the opposite: a recycler further away paying more per kg is often
the better trip. Score is now value-dominant (0.55), distance subtracted
(0.30), pickup added (0.10), staleness subtracted (0.05)."
```

---

### Task 3: Extract the detection run into a reusable module

`POST /detect-run` holds the entire run pipeline inside its handler. A second caller (handover confirm, Task 4) cannot reach it there. This is a pure refactor: behaviour must not change.

**Files:**
- Create: `server/api/src/lib/detectRun.js`
- Modify: `server/api/src/routes/detect.js` (replace lines 1-92 entirely)
- Test: none. **Correction (verified 2026-09-06): `server/api/test/detect.test.js` does not exist and never did — an error in this plan's first draft. Nothing under `server/api/test/` exercises the detect route at all.** Use the full `server/api` suite pass/fail count as the before/after refactor gate instead. Direct coverage for `runDetection` is Task 11.

**Interfaces:**
- Consumes: `buildDetectPayload(prisma, { asOf })` from `server/api/src/lib/history.js`; `callDetect(payload, { timeoutMs })` from `server/api/src/lib/aiml.js` returning `{ ok: true, body } | { ok: false, reason }`
- Produces: `runDetection(prisma, { asOf, timeoutMs })` → `Promise<{ runId, status: "ok"|"pending", reason?, detectorsRun: string[], detectorsSkipped: object[], flagsWritten: number, flagsRejected: object[] }>`

- [ ] **Step 1: Run the existing detect tests to capture the current green baseline**

Run: `cd server/api && npx vitest run --reporter=dot`

Expected: all pass. Note the count — it must be identical after the refactor.

- [ ] **Step 2: Create the module**

Create `server/api/src/lib/detectRun.js`:

```js
import { buildDetectPayload } from "./history.js";
import { callDetect } from "./aiml.js";
import { log } from "./logger.js";

// The flag vocabulary the API will persist. Anything outside it is rejected
// rather than stored, so a detector service change cannot silently widen the
// schema's effective enum.
const SUBJECT_TYPES = ["LOT", "HANDOVER", "RECYCLER", "COLLECTOR", "MARKET"];
const SEVERITIES = ["INFO", "WARN", "CRITICAL"];

/**
 * Run the eleven pattern detectors over the whole history and persist the flags.
 *
 * Extracted from routes/detect.js so it has two callers: the operator-triggered
 * route, and the post-handover-confirm path. A route handler cannot be invoked
 * from another route handler, and detection that only runs when a human POSTs to
 * an authenticated endpoint is, in a deployed configuration, detection that
 * never runs at all.
 *
 * FAIL-OPEN: a detector outage returns status "pending" with a reason. It never
 * throws for an unavailable service, because callers include a transaction path
 * that must not be blocked.
 */
export async function runDetection(prisma, { asOf, timeoutMs } = {}) {
  const at = asOf ?? new Date().toISOString();
  const payload = await buildDetectPayload(prisma, { asOf: at });
  log.detect.debug("payload built", { run_id: payload.run_id });

  const result = await callDetect(payload, { timeoutMs });

  if (!result.ok) {
    log.detect.warn("fail-open: detector service unavailable", { reason: result.reason });
    return {
      runId: payload.run_id,
      status: "pending",
      reason: result.reason,
      detectorsRun: [],
      detectorsSkipped: [],
      flagsWritten: 0,
      flagsRejected: [],
    };
  }

  const body = result.body;
  const runId = body.run_id ?? payload.run_id;
  const written = [];
  const rejected = [];

  for (const flag of body.flags ?? []) {
    if (!SUBJECT_TYPES.includes(flag.subject_type) || !SEVERITIES.includes(flag.severity)) {
      log.detect.warn("flag rejected: bad vocab", { flag });
      rejected.push({ flag, reason: "subject_type or severity outside the vocabulary" });
      continue;
    }

    const existing = await prisma.anomalyFlag.findFirst({
      where: {
        detectorCode: flag.detector_code,
        subjectType: flag.subject_type,
        subjectId: flag.subject_id,
        runId,
      },
      select: { id: true },
    });
    if (existing) {
      log.detect.debug("flag skipped: duplicate", {
        detector: flag.detector_code,
        subject: flag.subject_id,
      });
      continue;
    }

    const saved = await prisma.anomalyFlag.create({
      data: {
        subjectType: flag.subject_type,
        subjectId: flag.subject_id,
        detectorCode: flag.detector_code,
        severity: flag.severity,
        detail: flag.detail ?? {},
        configVersion: body.config_version ?? null,
        runId,
      },
    });
    log.detect.info("flag written", {
      id: saved.id,
      detector: flag.detector_code,
      severity: flag.severity,
    });
    written.push(saved);
  }

  log.detect.info("detect run complete", {
    flagsWritten: written.length,
    flagsRejected: rejected.length,
  });

  return {
    runId,
    status: "ok",
    detectorsRun: body.detectors_run ?? [],
    detectorsSkipped: body.detectors_skipped ?? [],
    flagsWritten: written.length,
    flagsRejected: rejected,
  };
}
```

- [ ] **Step 3: Replace the route with a thin wrapper**

Replace the entire contents of `server/api/src/routes/detect.js` with:

```js
import { Router } from "express";
import { prisma } from "../db.js";
import { requireSession } from "../middleware/requireSession.js";
import { runDetection } from "../lib/detectRun.js";
import { log } from "../lib/logger.js";

export const detectRouter = Router();

detectRouter.use(requireSession);

detectRouter.post("/", async (req, res, next) => {
  try {
    const asOf = req.body?.asOf ?? new Date().toISOString();
    log.detect.info("detect run started", { asOf, recycler: req.recycler.id });

    const result = await runDetection(prisma, {
      asOf,
      timeoutMs: req.body?.timeoutMs,
    });

    return res.json(result);
  } catch (err) {
    log.detect.error("detect run error", err);
    return next(err);
  }
});
```

- [ ] **Step 4: Run the detect tests — the count must be identical**

Run: `cd server/api && npx vitest run --reporter=dot`

Expected: the same number of passing tests as Step 1, zero failures. A refactor that changes a test outcome is not a refactor.

- [ ] **Step 5: Commit**

```bash
git add server/api/src/lib/detectRun.js server/api/src/routes/detect.js
git commit -m "refactor(api): extract runDetection from the detect route

No behaviour change. The run pipeline needs a second caller — the
post-handover-confirm path — and a route handler cannot be invoked from
another route handler."
```

---

### Task 4: Fire detection after every confirmed handover

This is the fix for the critical. Until now the eleven detectors ran only when a logged-in recycler manually POSTed `/detect-run`, and nothing in the app, the console, or any job ever did. In a deployed configuration D1–D13 produced zero rows, while the console's flags came from `callPredict` — a different, external service.

**Files:**
- Modify: `server/api/src/routes/handover.js` — imports, and inside `POST /:lot_id/confirm` after the `prisma.handover.update`
- Test: `server/api/test/handover-detect.test.js` (create)

**Interfaces:**
- Consumes: `runDetection(prisma, { asOf, timeoutMs })` from Task 3
- Produces: no new exports. The confirm response shape is unchanged: `{ handover_id, lot_id, confirmed_at, final_price }`

- [ ] **Step 1: Write the failing test**

Create `server/api/test/handover-detect.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";

// Mocked before the app is imported so the route binds the mock, not the real
// module. The point of this suite is the WIRING — that confirm calls detection
// and survives detection failing — not what the detectors compute.
vi.mock("../src/lib/detectRun.js", () => ({
  runDetection: vi.fn(),
}));

const { runDetection } = await import("../src/lib/detectRun.js");
const { createApp } = await import("../src/app.js");
const {
  prisma, truncateAll, makeRecycler, makeCollector, makeCategory, makeLot, makeHandover,
} = await import("./helpers/db.js");

const app = createApp();

beforeEach(async () => {
  await truncateAll();
  vi.clearAllMocks();
});

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

// A handover sitting in PENDING_COLLECTOR, ready to be counter-signed.
// makeHandover already defaults to that status and derives referenceCode from
// the lot id, so only the recycler's own signature needs setting here.
async function pendingHandover() {
  const recycler = await makeRecycler({ authorizationStatus: "VALID" });
  const collector = await makeCollector();
  const category = await makeCategory({ code: "CABLE" });
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id });
  const handover = await makeHandover({
    lotId: lot.id,
    recyclerId: recycler.id,
    recyclerConfirmedAt: new Date(),
  });
  return { lot, handover };
}

describe("POST /handover/:lot_id/confirm", () => {
  it("triggers a detection run once the handover is confirmed", async () => {
    runDetection.mockResolvedValue({ runId: "r1", status: "ok", flagsWritten: 0 });
    const { lot } = await pendingHandover();

    const res = await request(app).post(`/handover/${lot.id}/confirm`).send({});

    expect(res.status).toBe(200);
    // Fired without await, so let the microtask queue drain before asserting.
    await new Promise((r) => setImmediate(r));
    expect(runDetection).toHaveBeenCalledTimes(1);
  });

  it("still confirms the handover when the detector service is down", async () => {
    // The whole fail-open contract: a detector outage must never cost a
    // collector their counter-signature.
    runDetection.mockRejectedValue(new Error("aiml unreachable"));
    const { lot } = await pendingHandover();

    const res = await request(app).post(`/handover/${lot.id}/confirm`).send({});

    expect(res.status).toBe(200);
    expect(res.body.handover_id).toBeDefined();
    await new Promise((r) => setImmediate(r));
    const row = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(row.status).toBe("CONFIRMED");
  });

  it("does not trigger detection when the handover was already confirmed", async () => {
    runDetection.mockResolvedValue({ runId: "r1", status: "ok", flagsWritten: 0 });
    const { lot } = await pendingHandover();
    await request(app).post(`/handover/${lot.id}/confirm`).send({});
    await new Promise((r) => setImmediate(r));
    vi.clearAllMocks();

    const res = await request(app).post(`/handover/${lot.id}/confirm`).send({});

    expect(res.status).toBe(404);
    await new Promise((r) => setImmediate(r));
    expect(runDetection).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server/api && npx vitest run test/handover-detect.test.js --reporter=verbose`

Expected: FAIL — `expected "runDetection" to be called 1 times, but got 0 times`.

- [ ] **Step 3: Add the import to the handover route**

In `server/api/src/routes/handover.js`, add to the import block at the top of the file:

```js
import { runDetection } from "../lib/detectRun.js";
```

If `log` is not already imported in this file, also add:

```js
import { log } from "../lib/logger.js";
```

- [ ] **Step 4: Fire detection after the update commits**

In `server/api/src/routes/handover.js`, inside `handoverRouter.post("/:lot_id/confirm", ...)`, insert between the `const final_price = Number(updated.finalTotal);` line and the `return res.status(200).json({...})` line:

```js
    // Detection is the entire AI/ML claim, and before this it only ran when a
    // logged-in recycler manually POSTed /detect-run — which nothing did. In a
    // deployed configuration D1-D13 therefore never fired at all.
    //
    // Fired AFTER the update has committed and deliberately NOT awaited: the
    // same fail-open rule that governs callDetect governs this. A detector
    // outage must never cost a collector their counter-signature, and a slow
    // aiml service must never add latency to the handover that both parties are
    // standing there waiting for.
    void runDetection(prisma, {}).catch((err) => {
      log.detect.warn("post-confirm detection failed", { reason: err?.message });
    });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server/api && npx vitest run test/handover-detect.test.js --reporter=verbose`

Expected: 3 passed.

- [ ] **Step 6: Point the detect URL at the port the service actually runs on**

In `.env.example`, change:

```
AIML_DETECT_URL="http://127.0.0.1:8000"
```

to:

```
# server/aiml runs here. This MUST NOT be the same host as AIML_PREDICT_URL —
# they are two different services and pointing both at one host silently 404s
# whichever route that host lacks, invisibly, because both callers fail open.
AIML_DETECT_URL="http://127.0.0.1:8099"
```

Apply the same value to your local `server/api/.env`. Then start the detector service and confirm the wiring end to end:

```bash
cd server/aiml && .venv/bin/uvicorn bhaav_aiml.main:app --port 8099 &
curl -s http://127.0.0.1:8099/health
```

Expected: JSON listing the in-scope detectors.

- [ ] **Step 7: Run the full API suite**

Run: `cd server/api && npx vitest run --reporter=dot`

Expected: 0 failures.

- [ ] **Step 8: Commit**

```bash
git add server/api/src/routes/handover.js server/api/test/handover-detect.test.js .env.example
git commit -m "feat(api): run the pattern detectors after every confirmed handover

The eleven detectors were reachable only via POST /detect-run, an
authenticated route that nothing called — so in a deployed configuration
they never fired and the console's flags came entirely from the separate
external predict service. Detection now fires fail-open and un-awaited once
the two-sided handover commits."
```

---

### Task 5: Give the operator a "Run detection" control

The async trigger in Task 4 covers the natural path. This covers the demo path: a button that forces a run and shows what came back, so an empty flags page is never the thing on screen when a judge is watching.

**Files:**
- Modify: `client/console/src/app/(protected)/flags/page.jsx`
- Test: `client/console/test/flags.test.jsx` (create)

**Interfaces:**
- Consumes: `api.post(path, body)` and `api.get(path)` from `client/console/src/lib/api.js`; `useSession()` from `client/console/src/lib/useSession.js`
- Produces: no exports. Calls `POST /detect-run` and re-reads `GET /recycler/flags`

- [ ] **Step 1: Write the failing test**

Create `client/console/test/flags.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/lib/useSession.js", () => ({
  useSession: () => ({ id: "r1", name: "Bharat E Waste" }),
}));
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ApiError: class extends Error {},
}));

const { api } = await import("../src/lib/api.js");
const FlagsPage = (await import("../src/app/(protected)/flags/page.jsx")).default;

beforeEach(() => vi.clearAllMocks());

describe("FlagsPage", () => {
  it("runs detection and reports how many flags were written", async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({
      runId: "run-1",
      status: "ok",
      detectorsRun: ["D1", "D2", "D9"],
      detectorsSkipped: [{ code: "D10", reason: "insufficient dated history" }],
      flagsWritten: 3,
    });

    render(<FlagsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /run detection/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/detect-run", {}));
    expect(await screen.findByText(/3 flags written/i)).toBeInTheDocument();
    expect(screen.getByText(/D10/)).toBeInTheDocument();
  });

  it("says so plainly when the detector service is unavailable", async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({
      runId: "run-2",
      status: "pending",
      reason: "timeout after 2000ms",
      flagsWritten: 0,
    });

    render(<FlagsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /run detection/i }));

    expect(await screen.findByText(/detector service unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/timeout after 2000ms/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client/console && npx vitest run test/flags.test.jsx --reporter=verbose`

Expected: FAIL — `Unable to find an accessible element with the role "button" and name /run detection/i`.

- [ ] **Step 3: Add the control to the page**

In `client/console/src/app/(protected)/flags/page.jsx`, replace lines 14-33 (from `export default function FlagsPage() {` through the `<h1>Flags</h1>` line) with:

```jsx
export default function FlagsPage() {
  const recycler = useSession();
  const [flags, setFlags] = useState([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  const load = useCallback(async () => {
    const data = await api.get("/recycler/flags");
    setFlags(data.flags ?? data);
  }, []);

  useEffect(() => {
    if (recycler) load();
  }, [recycler, load]);

  // The async trigger on handover-confirm covers the natural path. This covers
  // the demo path: force a run on stage and show what came back, so an empty
  // list is never ambiguous between "nothing wrong" and "nothing ran".
  async function handleRun() {
    setRunning(true);
    try {
      const result = await api.post("/detect-run", {});
      setLastRun(result);
      await load();
    } catch (err) {
      setLastRun({ status: "error", reason: err?.message ?? "request failed" });
    } finally {
      setRunning(false);
    }
  }

  if (!recycler) return null;

  return (
    <>
      <Nav />
      <main>
        <h1>Flags</h1>

        <button type="button" onClick={handleRun} disabled={running}>
          {running ? "Running detection…" : "Run detection"}
        </button>

        {lastRun?.status === "ok" && (
          <p>
            {lastRun.flagsWritten} flags written from {lastRun.detectorsRun?.length ?? 0} detectors.
            {lastRun.detectorsSkipped?.length > 0 && (
              <>
                {" "}Skipped:{" "}
                {/* Skip.to_dict() serialises as { code, reason } — see
                    server/aiml/bhaav_aiml/models.py. */}
                {lastRun.detectorsSkipped
                  .map((s) => `${s.code} (${s.reason})`)
                  .join(", ")}
              </>
            )}
          </p>
        )}

        {lastRun?.status === "pending" && (
          <p role="alert">
            Detector service unavailable — no flags were written. {lastRun.reason}
          </p>
        )}

        {lastRun?.status === "error" && (
          <p role="alert">Detector service unavailable — {lastRun.reason}</p>
        )}
```

Leave everything from `{flags.length === 0 && (` to the end of the file unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client/console && npx vitest run test/flags.test.jsx --reporter=verbose`

Expected: 2 passed.

- [ ] **Step 5: Run the console suite**

Run: `cd client/console && npx vitest run --reporter=dot`

Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add "client/console/src/app/(protected)/flags/page.jsx" client/console/test/flags.test.jsx
git commit -m "feat(console): operator-triggered detection run on the flags page

Shows flags written, detectors run, and which detectors skipped with their
reason — so an empty list is never ambiguous between 'nothing is wrong' and
'nothing ran'."
```

---

### Task 6: Keep D1's INFO flags out of the operator's list

Adversarial simulation fired D1 on **449 of 1200 handovers (37%)** against an `alert_budget` of 0.05 — a 7× breach. D1 is INFO-only so it never escalates, but an operator scrolling 449 noise rows to find 7 real findings is an operator who stops reading the page. The budget governs what a human *sees*, so the fix is at the presentation boundary, not the threshold: raising `D1_deviation` would discard genuine signal from the dataset that D2 and the evaluation harness depend on.

**Files:**
- Modify: `server/api/src/routes/recycler.js` — the `GET /flags` handler's `where` clause
- Test: `server/api/test/flags-severity.test.js` (create)

**Interfaces:**
- Consumes: nothing new
- Produces: `GET /recycler/flags` excludes `severity: "INFO"` by default; `GET /recycler/flags?includeInfo=1` returns every severity. Response shape unchanged — a bare array of `{ id, subject_type, subject_id, detector_code, severity, detail, created_at }`

- [ ] **Step 1: Write the failing test**

Create `server/api/test/flags-severity.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeRecycler } from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";

const app = createApp();

beforeEach(truncateAll);
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

// Same shape rates.test.js uses: a recycler with a console account, and a
// supertest agent holding the session cookie that /auth/login sets. There is no
// shared login helper in test/helpers/db.js — each suite builds its own.
async function setupRecycler() {
  const recycler = await makeRecycler({ authorizationStatus: "VALID" });
  const passwordHash = await hashPassword("hunter2");
  await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email: "flags@example.com", passwordHash },
  });
  return recycler;
}

async function loginAgent() {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email: "flags@example.com", password: "hunter2" });
  return agent;
}

// D1 fires on roughly a third of all handovers by design — it is a
// per-handover INFO signal, not a finding. Three INFO rows and one WARN here
// stand in for that ratio.
async function seedFlags(recyclerId) {
  const rows = [
    { detectorCode: "D1", severity: "INFO" },
    { detectorCode: "D1", severity: "INFO" },
    { detectorCode: "D1", severity: "INFO" },
    { detectorCode: "D9", severity: "WARN" },
  ];
  for (const r of rows) {
    await prisma.anomalyFlag.create({
      data: {
        subjectType: "RECYCLER",
        subjectId: recyclerId,
        detectorCode: r.detectorCode,
        severity: r.severity,
        detail: {},
        runId: "run-1",
      },
    });
  }
}

describe("GET /recycler/flags", () => {
  it("omits INFO flags so the alert budget governs what the operator sees", async () => {
    const recycler = await setupRecycler();
    await seedFlags(recycler.id);
    const agent = await loginAgent();

    const res = await agent.get("/recycler/flags");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].detector_code).toBe("D9");
  });

  it("returns INFO flags when they are asked for explicitly", async () => {
    const recycler = await setupRecycler();
    await seedFlags(recycler.id);
    const agent = await loginAgent();

    const res = await agent.get("/recycler/flags?includeInfo=1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server/api && npx vitest run test/flags-severity.test.js --reporter=verbose`

Expected: FAIL — the first test gets 4 rows, expected 1.

- [ ] **Step 3: Add the severity filter**

In `server/api/src/routes/recycler.js`, inside the `GET /flags` handler, replace the `prisma.anomalyFlag.findMany({ ... })` call (starting at line 341) with:

```js
    // D1 fires on roughly a third of all handovers — it is a per-handover INFO
    // signal, not a finding. AI-ANOMALY-SPEC sets an alert budget of 5%, and that
    // budget governs what a human SEES: an operator scrolling hundreds of INFO
    // rows to reach a handful of real ones stops reading the page entirely.
    //
    // Filtered here rather than by raising D1_deviation, because the INFO rows
    // are real signal that D2 and the evaluation harness both consume — they
    // belong in the data, just not in the operator's default view.
    const includeInfo = req.query.includeInfo === "1";

    const flags = await prisma.anomalyFlag.findMany({
      where: {
        resolvedAt: null,
        ...(includeInfo ? {} : { severity: { not: "INFO" } }),
        OR: [
          { subjectType: "RECYCLER", subjectId: req.recycler.id },
          { subjectType: "HANDOVER", subjectId: { in: handoverIds } },
          { subjectType: "LOT", subjectId: { in: lotIds } },
        ],
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server/api && npx vitest run test/flags-severity.test.js --reporter=verbose`

Expected: 2 passed.

- [ ] **Step 5: Run the full API suite**

Run: `cd server/api && npx vitest run --reporter=dot`

Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add server/api/src/routes/recycler.js server/api/test/flags-severity.test.js
git commit -m "feat(api): exclude INFO flags from the operator flag list by default

D1 fires on ~37% of handovers against a 5% alert budget. The budget governs
what a human sees, so the filter belongs at the presentation boundary —
raising D1_deviation would discard signal the evaluation harness consumes.
?includeInfo=1 returns everything."
```

---

### Task 7: Make the simulator emit dated rate history

`simulate()` writes exactly one rate row per recycler per category, all sharing `valid_from = start` — 32 rows total for the default 8×4 shape. D3 needs at least `D3_min_history_days` (7) of span and two rows to compare; D10 needs 60 days; D12 needs a rate series to regress. All three are therefore untestable, and `late_onset_liar` — a profile generated specifically to be caught by D10 — can never be caught.

**Files:**
- Modify: `server/aiml/bhaav_aiml/simulate.py:91-105` (the rates block)
- Test: `server/aiml/tests/test_simulate.py` (existing — add cases)

**Interfaces:**
- Consumes: `config` dict with `seed`, and optionally `n_recyclers`, `n_lots`, `days`, `recycler_profiles`
- Produces: `simulate(config)["rates"]` is now a dated series — one row per recycler, per category, per repricing event. Row shape is unchanged: `{ recycler_id, category_id, unit, price, valid_from }`. New optional config key `reprice_every_days` (default 14). `simulate()` still returns `"simulated": True`.

- [ ] **Step 1: Write the failing tests**

Append to `server/aiml/tests/test_simulate.py`:

```python
def test_rates_span_the_whole_simulated_window():
    """D3 needs D3_min_history_days of span; a single valid_from gives it none."""
    out = simulate({"seed": 7, "days": 120, "n_recyclers": 4})
    stamps = sorted({r["valid_from"] for r in out["rates"]})
    assert len(stamps) > 1, "every rate shares one valid_from — D3/D10/D12 cannot run"

    first = datetime.fromisoformat(stamps[0])
    last = datetime.fromisoformat(stamps[-1])
    assert (last - first).days >= 60


def test_every_recycler_category_pair_has_a_rate_series():
    out = simulate({"seed": 7, "days": 120, "n_recyclers": 4})
    series = {}
    for r in out["rates"]:
        series.setdefault((r["recycler_id"], r["category_id"]), []).append(r)
    assert series, "no rates emitted"
    for key, rows in series.items():
        assert len(rows) >= 2, f"{key} has no series to trend"


def test_the_late_onset_liar_keeps_its_rate_high_after_it_switches():
    """D12's economic tell: someone genuinely receiving poor material lowers
    their published rate; someone lying cannot, because the high rate is what
    wins the lot."""
    out = simulate({
        "seed": 11, "days": 120, "n_recyclers": 3,
        "recycler_profiles": {"late_onset_liar": 1, "honest": 2},
    })
    liar = next(g["recycler_id"] for g in out["ground_truth"]
                if g.get("profile") == "late_onset_liar")

    rows = sorted(
        (r for r in out["rates"] if r["recycler_id"] == liar),
        key=lambda r: r["valid_from"],
    )
    assert rows[-1]["price"] >= rows[0]["price"] * 0.95
```

Add to the imports at the top of `server/aiml/tests/test_simulate.py` if not already present:

```python
from datetime import datetime
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server/aiml && .venv/bin/pytest tests/test_simulate.py -v -k "rates or series or late_onset"`

Expected: FAIL — `every rate shares one valid_from — D3/D10/D12 cannot run`.

- [ ] **Step 3: Replace the rates block with a dated series**

In `server/aiml/bhaav_aiml/simulate.py`, replace lines 91-105 (the block beginning `# Rates: published per recycler per category.` and ending with the closing `})` of the append) with:

```python
    # Rates: a dated series per recycler per category, not a single row.
    #
    # A single valid_from made three of eleven detectors unreachable on any
    # dataset: D3 (bait pricing) needs D3_min_history_days of span to see a
    # spike revert, D10 (downgrade change-point) needs D10_min_days of dated
    # history, and D12 (offers that never learn) needs a series to regress.
    # late_onset_liar existed purely to be caught by D10 and never could be.
    #
    # honest_low_grade publishes low from the start and drifts lower — they are
    # honest about the material. The liars cannot follow: publishing low loses
    # them the lot, and winning the lot is the entire point. That divergence is
    # exactly what D12 measures.
    reprice_every = config.get("reprice_every_days", 14)
    rates = []
    for r, profile in zip(recyclers, profiles):
        for cat in CATEGORIES:
            base = BASE_RATE[cat["code"]]
            for day in range(0, days, reprice_every):
                if profile == "honest_low_grade":
                    # Declares what they are, and keeps declaring it downward.
                    factor = 0.60 - 0.02 * (day / max(reprice_every, 1))
                elif profile in ("systematic_liar", "late_onset_liar", "monopolist"):
                    # Must stay high to keep winning lots; small jitter only.
                    factor = 1.00 + rng.uniform(-0.01, 0.01)
                else:
                    factor = 1.00 + rng.uniform(-0.05, 0.05)

                price = base * max(factor, 0.05)

                # D3's target: one recycler spikes to win the ranking, then
                # reverts within D3_revert_hours. Seeded, so it is reproducible.
                if profile == "systematic_liar" and day == reprice_every * 2:
                    price = base * 1.45

                rates.append({
                    "recycler_id": r["id"],
                    "category_id": cat["id"],
                    "unit": "KG",
                    "price": round(price, 2),
                    "valid_from": (start + timedelta(days=day)).isoformat(),
                })
```

- [ ] **Step 4: Make the rate lookup use the rate in force on the lot's day**

The lookup at lines 114-117 collapses the series to one price per pair, silently taking whichever row happens to be last. Replace it with:

```python
    # Build a per-pair series, newest last, so a lot can be priced at the rate
    # that was actually in force on its day rather than at whichever row the
    # dict happened to keep.
    rate_series: dict[tuple[str, str], list[dict]] = {}
    for x in rates:
        rate_series.setdefault((x["recycler_id"], x["category_id"]), []).append(x)
    for rows in rate_series.values():
        rows.sort(key=lambda x: x["valid_from"])

    def rate_on(recycler_id: str, category_id: str, when: datetime) -> float:
        rows = rate_series[(recycler_id, category_id)]
        in_force = [x for x in rows if datetime.fromisoformat(x["valid_from"]) <= when]
        return (in_force[-1] if in_force else rows[0])["price"]
```

- [ ] **Step 5: Price each lot at the rate in force on its day**

Replace the line `published = rate_lookup[(r["id"], cat["id"])]` with:

```python
        published = rate_on(r["id"], cat["id"], ts)
```

- [ ] **Step 6: Run the simulator tests to verify they pass**

Run: `cd server/aiml && .venv/bin/pytest tests/test_simulate.py -v`

Expected: all pass, including the three new cases.

- [ ] **Step 7: Run the whole Python suite**

Run: `cd server/aiml && .venv/bin/pytest -q`

Expected: 0 failures. Any detector test that broke was depending on a flat rate curve — read it and fix the fixture, not the detector.

- [ ] **Step 8: Commit**

```bash
git add server/aiml/bhaav_aiml/simulate.py server/aiml/tests/test_simulate.py
git commit -m "feat(aiml): emit a dated rate series from the simulator

One valid_from per recycler+category made D3, D10 and D12 unreachable on any
dataset — three of eleven detectors, including the one late_onset_liar exists
to be caught by. Rates now reprice on an interval across the window, and each
lot is priced at the rate in force on its day."
```

---

### Task 8: Implement D10 — the downgrade change-point

`d10_downgrade_change_point` unconditionally returns `Skip`, so it has never fired on any input. Task 7 supplies the dated history it was waiting for. A recycler who sat at a low downgrade rate for months and then jumped did not experience a change in material — they experienced a change in policy.

**Files:**
- Modify: `server/aiml/bhaav_aiml/detectors/grading.py` — replace `d10_downgrade_change_point`
- Test: `server/aiml/tests/test_grading_detectors.py` (append)

**Interfaces:**
- Consumes: `Context` with `.handovers`, `.lot_by_id()`; `Flag(detector, subject_type, subject_id, severity, detail)`; `Skip(detector, reason)`; `_is_downgrade(declared, inspected)` and `GRADE` already in this module
- Produces: `d10_downgrade_change_point(ctx, th) -> tuple[list[Flag], Skip | None]`. Flags carry `subject_type="RECYCLER"`, `severity="WARN"`, `detail={"trailing_rate", "preceding_rate", "step", "n_trailing", "n_preceding", "threshold"}`. Thresholds consumed: `D10_min_days`, `D10_min_handovers`, `D10_step`

- [ ] **Step 1: Write the failing tests**

Append to `server/aiml/tests/test_grading_detectors.py`:

```python
def test_d10_flags_a_recycler_whose_downgrade_rate_steps_up():
    """late_onset_liar is honest for the first half then switches. That is a
    change in policy, not a change in material, and D10 is the detector built
    for exactly that profile."""
    # ground_truth lives on the simulate() body, not on Context — Context
    # deliberately carries only what a detector may read.
    body = simulate({
        "seed": 5, "days": 180, "n_lots": 400, "n_collectors": 12, "n_recyclers": 3,
        "recycler_profiles": {"late_onset_liar": 1, "honest": 2},
    })
    ctx = Context.from_request(body)
    liar = next(g["recycler_id"] for g in body["ground_truth"]
                if g.get("profile") == "late_onset_liar")

    flags, skipped = d10_downgrade_change_point(ctx, THRESHOLDS)

    assert liar in [f.subject_id for f in flags]


def test_d10_leaves_a_consistently_honest_recycler_alone():
    ctx = Context.from_request(simulate({
        "seed": 5, "days": 180, "n_lots": 400, "n_collectors": 12, "n_recyclers": 3,
        "recycler_profiles": {"honest": 3},
    }))

    flags, skipped = d10_downgrade_change_point(ctx, THRESHOLDS)

    assert flags == []


def test_d10_skips_with_a_reason_when_history_is_too_short():
    """Skip-with-reason, never a silent empty result: an operator must be able
    to tell 'nothing wrong' from 'could not run'."""
    ctx = Context.from_request(simulate({
        "seed": 5, "days": 10, "n_lots": 20, "n_recyclers": 2,
    }))

    flags, skipped = d10_downgrade_change_point(ctx, THRESHOLDS)

    assert flags == []
    assert skipped is not None
    assert "history" in skipped.reason.lower() or "handover" in skipped.reason.lower()
```

Ensure the file's imports include `d10_downgrade_change_point`, `simulate`, `Context` and `THRESHOLDS`; match the import style already used at the top of that file.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server/aiml && .venv/bin/pytest tests/test_grading_detectors.py -v -k d10`

Expected: the first test FAILS (no flags — the stub returns an empty list); the third may already pass by accident, which is why the first is the real gate.

- [ ] **Step 3: Add the change-point thresholds**

In `server/aiml/bhaav_aiml/config.py`, replace the D10 block:

```python
    # D10 downgrade change-point. A recycler at a low downgrade rate for months
    # that jumps did not experience a change in material — it experienced a
    # change in policy. `step` is the absolute rise in downgrade RATE (0..1)
    # between the preceding and trailing windows, not a multiplier.
    "D10_step": 0.30,
    "D10_min_days": 60,
    "D10_min_handovers": 20,
    "D10_min_per_window": 8,
```

> Note the value change: `D10_step` was `3.0`, which is unreachable for a rate bounded at 1.0 — a threshold that could never fire even with perfect data. It is now `0.30`.

- [ ] **Step 4: Implement the detector**

In `server/aiml/bhaav_aiml/detectors/grading.py`, replace the whole `d10_downgrade_change_point` function with:

```python
def d10_downgrade_change_point(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """A recycler at a low downgrade rate for months that jumps did not
    experience a change in material — it experienced a change in policy.

    Splits each recycler's dated handovers at the midpoint of their own active
    window and compares downgrade rates either side. The split is per-recycler
    rather than global because recyclers join at different times, and a global
    midpoint would read a late joiner's whole history as one window.

    D10 is blind to anyone who lied from day one — their rate never steps
    because it was always high. D11 and D12 cover that case.
    """
    lot_by_id = ctx.lot_by_id()

    by_recycler: dict[str, list[tuple[datetime, int]]] = {}
    for h in ctx.handovers:
        lot = lot_by_id.get(h["lot_id"])
        if not lot or not h.get("handover_ts"):
            continue
        ts = datetime.fromisoformat(h["handover_ts"])
        d = 1 if _is_downgrade(lot["condition"], h.get("inspected_condition")) else 0
        by_recycler.setdefault(h["recycler_id"], []).append((ts, d))

    flags: list[Flag] = []
    skipped = None

    for recycler_id, series in sorted(by_recycler.items()):
        if len(series) < th["D10_min_handovers"]:
            skipped = Skip("D10", f"insufficient dated history: {len(series)} handovers for a "
                                  f"recycler, need {th['D10_min_handovers']}")
            continue

        series.sort(key=lambda x: x[0])
        span_days = (series[-1][0] - series[0][0]).days
        if span_days < th["D10_min_days"]:
            skipped = Skip("D10", f"insufficient dated history: {span_days} days for a "
                                  f"recycler, need {th['D10_min_days']}")
            continue

        midpoint = series[0][0] + (series[-1][0] - series[0][0]) / 2
        preceding = [d for ts, d in series if ts < midpoint]
        trailing = [d for ts, d in series if ts >= midpoint]

        if (len(preceding) < th["D10_min_per_window"]
                or len(trailing) < th["D10_min_per_window"]):
            skipped = Skip("D10", "handovers too unevenly distributed to split into windows")
            continue

        prec_rate = sum(preceding) / len(preceding)
        trail_rate = sum(trailing) / len(trailing)
        step = trail_rate - prec_rate

        if step >= th["D10_step"]:
            flags.append(Flag("D10", "RECYCLER", recycler_id, "WARN", {
                "trailing_rate": round(trail_rate, 4),
                "preceding_rate": round(prec_rate, 4),
                "step": round(step, 4),
                "n_trailing": len(trailing),
                "n_preceding": len(preceding),
                "threshold": th["D10_step"],
            }))

    return flags, skipped
```

Add `datetime` to the imports at the top of `server/aiml/bhaav_aiml/detectors/grading.py`:

```python
from datetime import datetime
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server/aiml && .venv/bin/pytest tests/test_grading_detectors.py -v -k d10`

Expected: 3 passed.

- [ ] **Step 6: Run the whole Python suite**

Run: `cd server/aiml && .venv/bin/pytest -q`

Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add server/aiml/bhaav_aiml/detectors/grading.py server/aiml/bhaav_aiml/config.py \
        server/aiml/tests/test_grading_detectors.py
git commit -m "feat(aiml): implement D10 downgrade change-point

D10 unconditionally returned Skip, so late_onset_liar — a profile that exists
only to be caught by it — never was. Splits each recycler's dated handovers at
their own active midpoint and compares downgrade rates either side. D10_step
also corrected from 3.0 to 0.30: a rate is bounded at 1.0, so the old value
could never fire."
```

---

### Task 9: Implement D12 — offers that never learn

`d12_offers_never_learn` unconditionally returns `Skip`. Task 7 supplies the rate series it needs. The economic argument: a recycler genuinely receiving poor material lowers their published rate; a liar cannot, because the high published rate is what wins them the lot. A persistently large, flat gap between published and paid is the tell.

**Files:**
- Modify: `server/aiml/bhaav_aiml/detectors/grading.py` — replace `d12_offers_never_learn`
- Modify: `server/aiml/bhaav_aiml/config.py` — D12 thresholds
- Test: `server/aiml/tests/test_grading_detectors.py` (append)

**Interfaces:**
- Consumes: `Context` with `.handovers`, `.rates`, `.acceptance_by_lot()`, `.lot_by_id()`
- Produces: `d12_offers_never_learn(ctx, th) -> tuple[list[Flag], Skip | None]`. Flags carry `subject_type="RECYCLER"`, `severity="WARN"`, `detail={"mean_drop", "rate_trend", "n_handovers", "span_days", "threshold"}`. Thresholds consumed: `D12_min_handovers`, `D12_min_days`, `D12_flat_drop_min`, `D12_rate_fall_max`

- [ ] **Step 1: Write the failing tests**

Append to `server/aiml/tests/test_grading_detectors.py`:

```python
def test_d12_flags_a_liar_who_keeps_publishing_high_while_paying_low():
    body = simulate({
        "seed": 13, "days": 150, "n_lots": 400, "n_collectors": 12, "n_recyclers": 3,
        "recycler_profiles": {"systematic_liar": 1, "honest": 2},
    })
    ctx = Context.from_request(body)
    liar = next(g["recycler_id"] for g in body["ground_truth"]
                if g.get("profile") == "systematic_liar")

    flags, skipped = d12_offers_never_learn(ctx, THRESHOLDS)

    assert liar in [f.subject_id for f in flags]


def test_d12_exonerates_the_honest_low_grade_recycler_who_lowers_their_rate():
    """The separating equilibrium: declaring what you are is cheap for an honest
    recycler and impossible for a liar, because the high rate is what wins the
    lot. D12 must not punish the declaration."""
    body = simulate({
        "seed": 13, "days": 150, "n_lots": 400, "n_collectors": 12, "n_recyclers": 3,
        "recycler_profiles": {"honest_low_grade": 1, "honest": 2},
    })
    ctx = Context.from_request(body)
    honest_low = next(g["recycler_id"] for g in body["ground_truth"]
                      if g.get("profile") == "honest_low_grade")

    flags, skipped = d12_offers_never_learn(ctx, THRESHOLDS)

    assert honest_low not in [f.subject_id for f in flags]


def test_d12_skips_with_a_reason_on_a_thin_series():
    ctx = Context.from_request(simulate({
        "seed": 13, "days": 10, "n_lots": 20, "n_recyclers": 2,
    }))

    flags, skipped = d12_offers_never_learn(ctx, THRESHOLDS)

    assert flags == []
    assert skipped is not None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server/aiml && .venv/bin/pytest tests/test_grading_detectors.py -v -k d12`

Expected: the first test FAILS (empty flag list from the stub).

- [ ] **Step 3: Add the D12 thresholds**

In `server/aiml/bhaav_aiml/config.py`, replace the D12 block:

```python
    # D12 offers that never learn. `flat_drop_min` is the mean shortfall of paid
    # against published (1 - paid/published) that counts as a persistent gap;
    # `rate_fall_max` is how far a recycler's OWN published rate may fall across
    # the window before they count as having learned — falling further is the
    # honest declaration D12 must not punish.
    "D12_min_handovers": 15,
    "D12_min_days": 30,
    "D12_flat_drop_min": 0.20,
    "D12_rate_fall_max": 0.15,
```

- [ ] **Step 4: Implement the detector**

In `server/aiml/bhaav_aiml/detectors/grading.py`, replace the whole `d12_offers_never_learn` function with:

```python
def d12_offers_never_learn(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Someone genuinely receiving poor material lowers their published rate;
    someone lying cannot, because the high rate is what wins the lot.

    Two conditions must hold together: a persistent gap between published and
    paid, AND a published rate that has not fallen. Either alone is innocent —
    a large gap with a falling rate is a recycler correcting course, and a flat
    rate with no gap is a recycler who simply pays what they advertise.

    This is the detector that makes the separating equilibrium legible: the
    honest low-grade recycler declares by dropping their rate and is exonerated;
    the liar cannot drop theirs without losing the lots that are the whole point.
    """
    acc_by_lot = ctx.acceptance_by_lot()

    drops: dict[str, list[float]] = {}
    stamps: dict[str, list[datetime]] = {}
    for h in ctx.handovers:
        if h.get("status") != "CONFIRMED":
            continue
        a = acc_by_lot.get(h["lot_id"])
        if not a or not a["accepted_rate"]:
            continue
        drops.setdefault(h["recycler_id"], []).append(
            1.0 - (h["final_unit_price"] / a["accepted_rate"])
        )
        if h.get("handover_ts"):
            stamps.setdefault(h["recycler_id"], []).append(
                datetime.fromisoformat(h["handover_ts"])
            )

    # Published-rate trajectory per recycler, averaged across their categories so
    # a recycler dealing in more categories is not weighted differently.
    series: dict[str, dict[str, list[dict]]] = {}
    for r in ctx.rates:
        series.setdefault(r["recycler_id"], {}).setdefault(r["category_id"], []).append(r)

    def rate_fall(recycler_id: str) -> float | None:
        """Fraction by which this recycler's published rate fell across the
        window. Positive means they lowered it."""
        falls = []
        for rows in series.get(recycler_id, {}).values():
            rows = sorted(rows, key=lambda x: x["valid_from"])
            if len(rows) < 2 or not rows[0]["price"]:
                continue
            falls.append((rows[0]["price"] - rows[-1]["price"]) / rows[0]["price"])
        return sum(falls) / len(falls) if falls else None

    flags: list[Flag] = []
    skipped = None

    for recycler_id, ds in sorted(drops.items()):
        if len(ds) < th["D12_min_handovers"]:
            skipped = Skip("D12", f"insufficient series: {len(ds)} confirmed handovers for a "
                                  f"recycler, need {th['D12_min_handovers']}")
            continue

        ts = sorted(stamps.get(recycler_id, []))
        span_days = (ts[-1] - ts[0]).days if len(ts) >= 2 else 0
        if span_days < th["D12_min_days"]:
            skipped = Skip("D12", f"insufficient series: {span_days} days for a recycler, "
                                  f"need {th['D12_min_days']}")
            continue

        fall = rate_fall(recycler_id)
        if fall is None:
            skipped = Skip("D12", "no published-rate series to trend")
            continue

        mean_drop = sum(ds) / len(ds)

        # Persistent gap AND a rate that has not meaningfully fallen.
        if mean_drop >= th["D12_flat_drop_min"] and fall < th["D12_rate_fall_max"]:
            flags.append(Flag("D12", "RECYCLER", recycler_id, "WARN", {
                "mean_drop": round(mean_drop, 4),
                "rate_trend": round(fall, 4),
                "n_handovers": len(ds),
                "span_days": span_days,
                "threshold": th["D12_flat_drop_min"],
            }))

    return flags, skipped
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server/aiml && .venv/bin/pytest tests/test_grading_detectors.py -v -k d12`

Expected: 3 passed.

- [ ] **Step 6: Run the whole Python suite**

Run: `cd server/aiml && .venv/bin/pytest -q`

Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add server/aiml/bhaav_aiml/detectors/grading.py server/aiml/bhaav_aiml/config.py \
        server/aiml/tests/test_grading_detectors.py
git commit -m "feat(aiml): implement D12 offers that never learn

Requires a persistent published-vs-paid gap AND a published rate that has not
fallen. Either alone is innocent, and the conjunction is what keeps the honest
low-grade recycler — who declares by lowering their rate — out of the flags."
```

---

### Task 10: Build the evaluation harness

Plan 04 Task 8, never built. Without it, detector quality is asserted rather than measured — and the strongest AI/ML answer available ("we ran an adversarial simulation with planted bad actors, caught both, zero false positives across four honest recyclers") has no reproducible artefact behind it.

**Files:**
- Create: `server/aiml/bhaav_aiml/evaluate.py`
- Create: `server/aiml/tests/test_evaluate.py`

**Interfaces:**
- Consumes: `simulate(config)` from `bhaav_aiml.simulate`; `run_detectors(ctx, thresholds)` from `bhaav_aiml.detectors`; `Context.from_request(body)` from `bhaav_aiml.models`; `THRESHOLDS`, `CONFIG_VERSION`, `IN_SCOPE` from `bhaav_aiml.config`
- Produces:
  - `evaluate(config, thresholds=THRESHOLDS) -> dict` with keys `recall`, `precision`, `alert_rate`, `within_budget`, `alert_budget`, `caught`, `missed`, `false_positives`, `flags_by_detector`, `detectors_run`, `detectors_skipped`, `n_handovers`, `n_guilty`, `n_innocent`, `config_version`, `simulated`
  - `baseline_flag_everyone(body) -> dict` — takes the `simulate()` body (not a `Context`, which does not carry `ground_truth`); returns `recall`/`precision`/`alert_rate`/`simulated`
  - `eval_report(result) -> str` — a plain-text block for the terminal and the deck

**Guilty profiles** (the ground truth this harness scores against): `systematic_liar`, `late_onset_liar`, `monopolist`. `honest` and `honest_low_grade` are innocent — `honest_low_grade` deliberately so, because flagging it is the exact false positive the design exists to avoid.

- [ ] **Step 1: Write the failing tests**

Create `server/aiml/tests/test_evaluate.py`:

```python
from bhaav_aiml.config import THRESHOLDS
from bhaav_aiml.evaluate import evaluate, baseline_flag_everyone, eval_report, GUILTY_PROFILES
from bhaav_aiml.simulate import simulate

ADVERSARIAL = {
    "seed": 42, "days": 200, "n_lots": 1200, "n_collectors": 30, "n_recyclers": 5,
    "recycler_profiles": {
        "systematic_liar": 1,
        "late_onset_liar": 1,
        "monopolist": 1,
        "honest_low_grade": 1,
        "honest": 1,
    },
}


def test_evaluate_catches_the_planted_bad_actors():
    result = evaluate(ADVERSARIAL, THRESHOLDS)
    assert result["recall"] >= 0.66, f"missed {result['missed']}"


def test_evaluate_does_not_flag_the_honest_low_grade_recycler():
    """The separation test. honest_low_grade is honest by construction and is
    the single false positive this whole design exists to avoid."""
    result = evaluate(ADVERSARIAL, THRESHOLDS)
    truth = {g["recycler_id"]: g["profile"]
             for g in simulate(ADVERSARIAL)["ground_truth"]
             if g["kind"] == "recycler_profile"}
    for rid in result["false_positives"]:
        assert truth.get(rid) != "honest_low_grade", "flagged the honest low-grade recycler"


def test_evaluate_reports_whether_it_is_inside_the_alert_budget():
    result = evaluate(ADVERSARIAL, THRESHOLDS)
    assert "alert_rate" in result
    assert result["within_budget"] == (result["alert_rate"] <= THRESHOLDS["alert_budget"])


def test_the_baseline_is_beaten():
    """Flagging everyone gets perfect recall and is useless. A detector suite
    that cannot beat it on precision has demonstrated nothing."""
    base = baseline_flag_everyone(simulate(ADVERSARIAL))
    result = evaluate(ADVERSARIAL, THRESHOLDS)
    assert base["recall"] == 1.0
    assert result["precision"] > base["precision"]


def test_evaluate_is_deterministic():
    assert evaluate(ADVERSARIAL, THRESHOLDS) == evaluate(ADVERSARIAL, THRESHOLDS)


def test_the_report_labels_its_data_simulated():
    """README ground rule 2 — simulated data is labelled simulated, every time."""
    text = eval_report(evaluate(ADVERSARIAL, THRESHOLDS))
    assert "SIMULATED" in text.upper()
    assert "recall" in text.lower()


def test_guilty_profiles_excludes_the_honest_low_grade_recycler():
    assert "honest_low_grade" not in GUILTY_PROFILES
    assert "honest" not in GUILTY_PROFILES
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server/aiml && .venv/bin/pytest tests/test_evaluate.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'bhaav_aiml.evaluate'`.

- [ ] **Step 3: Write the module**

Create `server/aiml/bhaav_aiml/evaluate.py`:

```python
"""Measure the detector suite against labelled ground truth.

There is no real transaction history, so precision and recall are measured
against the seeded simulator's ground_truth rather than against reality. That is
a real limitation and it is stated in the report itself, not buried here — the
number this produces is "our detectors separate planted archetypes", not "our
detectors catch fraud in Maharashtra".

The baseline matters as much as the score. Flagging every recycler achieves
perfect recall and is worthless; a suite that cannot beat that on precision has
demonstrated nothing.
"""

from __future__ import annotations

from bhaav_aiml.config import THRESHOLDS, CONFIG_VERSION
from bhaav_aiml.detectors import run_detectors
from bhaav_aiml.models import Context
from bhaav_aiml.simulate import simulate

# honest_low_grade is deliberately NOT here. It has a downgrade rate as high as
# a liar's and is innocent by construction — flagging it is the exact false
# positive D9 exists to prevent, so it must count against precision.
GUILTY_PROFILES = ("systematic_liar", "late_onset_liar", "monopolist")


def _truth(body: dict) -> dict[str, str]:
    return {
        g["recycler_id"]: g["profile"]
        for g in body.get("ground_truth", [])
        if g.get("kind") == "recycler_profile"
    }


def evaluate(config: dict, thresholds: dict = THRESHOLDS) -> dict:
    """Run the suite over a simulated corpus and score it against ground truth."""
    body = simulate(config)
    ctx = Context.from_request(body)
    truth = _truth(body)

    # run_detectors returns THREE values — (flags, ran_codes, skipped) — see
    # server/aiml/bhaav_aiml/detectors/__init__.py.
    flags, ran, skipped = run_detectors(ctx, thresholds)

    guilty = {rid for rid, p in truth.items() if p in GUILTY_PROFILES}
    innocent = set(truth) - guilty

    # A recycler counts as accused only on a WARN or CRITICAL against them
    # directly. INFO is per-handover noise, and a MARKET finding names a
    # district rather than a person — neither is an accusation of a recycler.
    accused = {
        f.subject_id
        for f in flags
        if f.subject_type == "RECYCLER" and f.severity in ("WARN", "CRITICAL")
    }

    caught = sorted(guilty & accused)
    missed = sorted(guilty - accused)
    false_positives = sorted(innocent & accused)

    recall = len(caught) / len(guilty) if guilty else 0.0
    precision = len(caught) / len(accused) if accused else 0.0

    n_handovers = len(ctx.handovers)
    alert_rate = (len(flags) / n_handovers) if n_handovers else 0.0

    by_detector: dict[str, int] = {}
    for f in flags:
        by_detector[f.detector_code] = by_detector.get(f.detector_code, 0) + 1

    return {
        "recall": round(recall, 4),
        "precision": round(precision, 4),
        "alert_rate": round(alert_rate, 4),
        "within_budget": alert_rate <= thresholds["alert_budget"],
        "alert_budget": thresholds["alert_budget"],
        "caught": caught,
        "missed": missed,
        "false_positives": false_positives,
        "flags_by_detector": dict(sorted(by_detector.items())),
        "detectors_run": sorted(ran),
        # Skip's field is `code`, not `detector` — see models.py.
        "detectors_skipped": sorted({s.code: s.reason for s in skipped}.items()),
        "n_handovers": n_handovers,
        "n_guilty": len(guilty),
        "n_innocent": len(innocent),
        "config_version": CONFIG_VERSION,
        "simulated": True,
    }


def baseline_flag_everyone(body: dict) -> dict:
    """The null model: accuse every recycler. Perfect recall, useless precision.
    Any real result must beat this on precision or it has shown nothing.

    Takes the simulate() body rather than a Context, because Context carries only
    what a detector may read and ground_truth is deliberately not part of that.
    """
    truth = _truth(body)
    guilty = {rid for rid, p in truth.items() if p in GUILTY_PROFILES}
    everyone = set(truth)

    return {
        "recall": round(len(guilty & everyone) / len(guilty), 4) if guilty else 0.0,
        "precision": round(len(guilty & everyone) / len(everyone), 4) if everyone else 0.0,
        "alert_rate": 1.0,
        "simulated": True,
    }


def eval_report(result: dict) -> str:
    """Plain text for a terminal and for the deck. Every number carries its
    denominator, and the simulated label is not optional."""
    lines = [
        "DETECTOR EVALUATION — SIMULATED DATA, NOT REAL TRANSACTIONS",
        f"config_version : {result['config_version']}",
        f"handovers      : {result['n_handovers']}",
        f"recyclers      : {result['n_guilty']} planted bad actors, "
        f"{result['n_innocent']} innocent",
        "",
        f"recall         : {result['recall']}  "
        f"({len(result['caught'])}/{result['n_guilty']} bad actors caught)",
        f"precision      : {result['precision']}",
        f"alert rate     : {result['alert_rate']} against a budget of "
        f"{result['alert_budget']} — "
        f"{'WITHIN' if result['within_budget'] else 'OVER'} budget",
        "",
        f"caught         : {', '.join(result['caught']) or 'none'}",
        f"missed         : {', '.join(result['missed']) or 'none'}",
        f"false positives: {', '.join(result['false_positives']) or 'NONE'}",
        "",
        "flags by detector:",
    ]
    for code, n in result["flags_by_detector"].items():
        lines.append(f"  {code:<5} x{n}")
    if result["detectors_skipped"]:
        lines.append("")
        lines.append("skipped, with reasons:")
        for code, reason in result["detectors_skipped"]:
            lines.append(f"  {code:<5} {reason}")
    lines += [
        "",
        "Ground truth comes from the seeded simulator, not from reality. This",
        "measures separation of planted archetypes, not detection of real fraud.",
    ]
    return "\n".join(lines)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server/aiml && .venv/bin/pytest tests/test_evaluate.py -v`

Expected: 7 passed.

If `test_evaluate_catches_the_planted_bad_actors` fails, do **not** loosen the assertion. Print `eval_report(evaluate(ADVERSARIAL, THRESHOLDS))` and read which detector should have fired on the missed profile. A miss is a finding about the detectors, not about the test.

- [ ] **Step 5: Add a script entry point so the numbers are reproducible on demand**

Append to `server/aiml/bhaav_aiml/evaluate.py`:

```python
if __name__ == "__main__":  # pragma: no cover
    # `python -m bhaav_aiml.evaluate` — the adversarial run quoted in the deck.
    print(eval_report(evaluate({
        "seed": 42, "days": 200, "n_lots": 1200, "n_collectors": 30, "n_recyclers": 5,
        "recycler_profiles": {
            "systematic_liar": 1,
            "late_onset_liar": 1,
            "monopolist": 1,
            "honest_low_grade": 1,
            "honest": 1,
        },
    })))
```

- [ ] **Step 6: Run it and read the output**

Run: `cd server/aiml && .venv/bin/python -m bhaav_aiml.evaluate`

Expected: the report block, with a non-zero recall, an empty false-positives line, and every skipped detector carrying a reason. Paste this output into the demo notes — it is the artefact behind the AI/ML claim.

- [ ] **Step 7: Run the whole Python suite**

Run: `cd server/aiml && .venv/bin/pytest -q`

Expected: 0 failures.

- [ ] **Step 8: Commit**

```bash
git add server/aiml/bhaav_aiml/evaluate.py server/aiml/tests/test_evaluate.py
git commit -m "feat(aiml): evaluation harness — recall, precision, alert budget, baseline

Plan 04 task 8. Scores the suite against the simulator's labelled ground truth
and against a flag-everyone baseline, so detector quality is measured rather
than asserted. honest_low_grade counts as innocent: flagging it is the exact
false positive the separation design exists to prevent."
```

---

## Verification — run before calling this plan done

- [ ] `npx vitest run --reporter=dot` from the repo root → 0 failures
- [ ] `cd client/console && npx vitest run` → 0 failures
- [ ] `cd client/app && npx jest --silent` → 0 failures
- [ ] `cd server/aiml && .venv/bin/pytest -q` → 0 failures
- [ ] `cd server/aiml && .venv/bin/python -m bhaav_aiml.evaluate` → report prints, false positives line reads `NONE`
- [ ] **End-to-end, by hand:** start `server/aiml` on `:8099`, start the API and console, log into the console, complete a handover in the app, confirm it, then open the flags page — flags from D1–D13 must appear without pressing anything. Then press "Run detection" and confirm the counts update.
- [ ] `grep -rn "rateMatch\|collectorExpectedRate" --include="*.js" --include="*.jsx" client server packages | grep -v node_modules` → no output
