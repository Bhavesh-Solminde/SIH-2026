# Repair, SMS and Evidence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Everything outstanding except the AI model payload and the anomaly detectors — repair the broken test infrastructure, add SMS notifications via Fast2SMS, ship the provenance/evidence features, pay off the code-hygiene debt, and bring every document in line with the decisions actually made.

**Architecture:** Four independent repairs first (they gate honest verification of everything else), then SMS as a fail-open side-effect library mirroring the existing `aiml.js`, then the evidence features, then hygiene, then a documentation pass that describes the finished state rather than the intended one.

**Tech Stack:** Node 22 + Express + Prisma + Postgres, Next.js 15 App Router, Expo/React Native + Jest, Vitest.

## Global Constraints

- **ESM everywhere in JS.** `"type": "module"`; all relative imports carry a `.js` extension.
- **JavaScript only** in JS workspaces — no `.ts` files.
- **`server/aiml/**` is OFF LIMITS to every task in this plan.** A separate orchestrator (Leader 2) owns that directory exclusively and is working in it concurrently.
- **Do NOT touch the AI model payload** in `server/api/src/routes/handover.js::scoreHandover` (`referencePrice`/`buyerOffer`). It is a known, deliberately deferred issue.
- **Do NOT run `pytest`.** Leader 2 owns it.
- **One agent at a time on the `server/api` suite.** `DATABASE_URL_TEST` is a single shared REMOTE database (Supabase) and every test calls `truncateAll()` in `beforeEach`. Concurrent runs truncate each other's fixtures.
- **Never `git add -A` or `git add .`** — the working tree carries unrelated uncommitted files from other agents. Stage named paths only.
- **Fail-open is absolute** for every outbound network side-effect (detection, SMS). A third-party outage must never block a sale, an acceptance, or a handover.
- **No personal data beyond what is opt-in.** `README.md` ground rule 7 is "no name, no Aadhaar, **no mandatory phone**" — an optional phone is permitted, a required one is not.
- **Simulated data is labelled simulated**, on screen and in the deck.
- **Verify before creating.** This plan's predecessor was factually wrong twice about whether a file existed. Before any "Create" step, run `ls <path>` and `git show HEAD:<path>`. If the file exists, STOP and report — do not overwrite.
- Conventional commit messages.

## Known pre-existing failure

`server/api/test/sync-delta.test.js > "returns only rates created after the cursor"` fails most runs. **Task 1 fixes it.** Until Task 1 lands, the expected `server/api` baseline is **104 passed / 1 failed**.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `server/api/src/routes/sync.js` | `/sync/delta` rate cursor; `/sync/push` batching | 1, 4 |
| `client/app/jest.config.js` | `components` project transform | 2 |
| `client/console/vitest.config.js` | Test collection scope | 3 |
| `server/api/src/lib/sms.js` | Fail-open Fast2SMS sender | **Create** — 5 |
| `server/api/src/routes/recycler.js` | Acceptance-respond hook for recycler SMS | 5 |
| `server/api/prisma/schema.prisma` | `CollectorContact` model | 6 |
| `client/console/src/components/{HandoverForm,QrScanner,FlagCard}.jsx` | Extracted from `verify/page.jsx` | **Create** — 7 |
| `packages/core/src/ranking.js`, `src/ids.js` | Single-source condition factors; comment fix | 8 |
| `client/app/src/screens/*`, `client/console/src/app/*` | Authorisation-evidence panel | 9 |
| `server/api/scripts/mpcb-refresh.js` | Dated CSV re-parse | **Create** — 10 |
| `FLOW.md`, `flow_audit.md`, `README.md`, `AI.md`, `SERVER.md`, `DB.md`, `FRONTEND.md`, `PRODUCT.md` | Docs describing the finished state | 12 |

---

## Wave plan (dispatch order)

```
Wave A  T1 (DB)      T2 (app)        T3 (console)      ← 3 parallel, only T1 uses the database
Wave B  T5 (DB)      T7 (console)                      ← 2 parallel
Wave C  T6 (DB)      T8 (core)                         ← 2 parallel
Wave D  T4 (DB)      T9 (app+console)                  ← 2 parallel
Wave E  T10 (DB)     T11 (DB, serial after T10)
Wave F  T12 (docs)                                     ← LAST. Must describe the finished state.
```

---

### Task 1: Fix the `/sync/delta` rate cursor

**Files:**
- Modify: `server/api/src/routes/sync.js` — the rate query inside `GET /delta`
- Modify (only if the test itself is proven wrong): `server/api/test/sync-delta.test.js`

**Interfaces:**
- Consumes: `prisma`, `loadSnapshot()` already in the module
- Produces: no signature change. `GET /sync/delta?since=<ISO>` response shape is unchanged.

This is a **diagnosis task**, not a transcription task. The failing test is `"returns only rates created after the cursor"`. It fails standalone and in-suite, most runs but not all — which points at a boundary/precision issue rather than pure flakiness.

- [ ] **Step 1: Reproduce and characterise**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api"
for i in 1 2 3 4 5; do npx vitest run test/sync-delta.test.js --reporter=dot 2>&1 | grep -E "^ +Tests"; done
```

Record how many of 5 runs fail. Paste it into your report.

- [ ] **Step 2: Read both sides before forming a hypothesis**

Read the test body (`server/api/test/sync-delta.test.js`, the failing `it`) and the rate query inside `GET /delta` in `server/api/src/routes/sync.js`.

The test already documents one subtlety in its own comments: it takes the cursor from the **database clock** via `SELECT now()`, not the process clock, because against a remote database even a few milliseconds of skew moves the "new" row before the cursor.

Form and write down a specific hypothesis before changing anything. Candidates worth checking, but do not assume any of them:
- `gt` vs `gte` on the cursor comparison, when two rows can share a timestamp
- The rate query filtering on `validFrom` (a business date supplied by the caller) where it should filter on `createdAt` (the append-only insertion time) — note `publish(...)` in the test passes `valid_from` values of `2026-08-30` and `2026-09-01`, both of which are in the *past* relative to a `now()` cursor
- Postgres `timestamptz` microsecond precision versus JavaScript `Date` millisecond precision, truncating the cursor and re-including a row

- [ ] **Step 3: Prove the hypothesis before fixing**

Add a temporary `console.log` (or a scratch query) that prints the cursor and the `created_at`/`valid_from` of both rate rows. Run it. Confirm the numbers match your hypothesis. Paste that output into your report. Remove the temporary logging afterwards.

- [ ] **Step 4: Fix the narrower of the two**

If the endpoint is wrong, fix `sync.js`. If the *test* is wrong, fix the test — but you must justify that in your report with the evidence from Step 3, because the endpoint is on the offline-sync demo path and a test bent to fit a broken endpoint is worse than a failing one.

Whichever you change, add a comment naming the root cause, e.g.:

```js
// created_at, not valid_from: valid_from is a business date the publisher
// chooses and can be back-dated, so filtering on it makes the delta cursor
// non-monotonic. The append-only insertion time is the only monotonic clock
// this table has.
```

- [ ] **Step 5: Prove it is fixed, not merely passing once**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api"
for i in 1 2 3 4 5 6 7 8 9 10; do npx vitest run test/sync-delta.test.js --reporter=dot 2>&1 | grep -E "^ +Tests"; done
```

Expected: 10 of 10 runs pass. Anything less means the root cause is not fixed.

- [ ] **Step 6: Full suite**

Run: `cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api" && npx vitest run --reporter=dot`

Expected: **105 passed, 0 failed.** This is the first time this suite has been fully green.

- [ ] **Step 7: Commit**

```bash
git add server/api/src/routes/sync.js
git commit -m "fix(api): use the append-only insertion time as the /sync/delta cursor

<one line naming the actual root cause you proved in Step 3>"
```

---

### Task 2: Make the six dead `client/app` test suites run

Six of nineteen Jest suites never execute. They fail at transform time with `@react-native/js-polyfills/error-guard.js: Missing semicolon (14:4)` — a Flow-typed React Native source reaching a Babel config that has only `@babel/preset-env`. 60 tests pass today; `useStrings`, `Text`, `Button`, `CategoryIcon`, `SyncEngine` and `repos` contribute nothing.

**Files:**
- Modify: `client/app/jest.config.js` — the `components` project (and the `screens`/`node` projects only if Step 2 proves they share the cause)

**Interfaces:**
- Consumes: `babel-preset-expo` (already a devDependency — verify in Step 1)
- Produces: no source change. Only test configuration.

- [ ] **Step 1: Establish the baseline and confirm the preset is available**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/client/app"
npx jest 2>&1 | tail -6
node -e "console.log(require.resolve('babel-preset-expo'))" || echo "babel-preset-expo NOT INSTALLED"
cat babel.config.js
```

Record the suite/test counts. If `babel-preset-expo` is not installed, STOP and report — you may not modify `package.json`.

- [ ] **Step 2: Identify every project whose `testMatch` covers a failing suite**

Read `client/app/jest.config.js` in full. The failing files are `test/i18n/useStrings.test.js`, `test/ui/Text.test.js`, `test/ui/Button.test.js`, `test/components/CategoryIcon.test.js`, `test/screens/SyncEngine.test.js`, `test/db/repos.test.js`. Map each to its project and note whether the cause is the same for all six — the last two are in different projects and may fail for a different reason. Report the mapping.

- [ ] **Step 3: Give the affected project(s) the React Native preset**

For each project whose suites fail with the `error-guard.js` transform error, change its `transform` to use `babel-preset-expo`, which understands Flow-typed RN sources:

```js
      transform: {
        // @react-native/js-polyfills ships Flow-typed sources. @babel/preset-env
        // alone cannot parse them, which is why every suite in this project died
        // at transform time with "error-guard.js: Missing semicolon (14:4)" —
        // six suites that never ran at all while the summary still said 60 passing.
        "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }],
      },
      transformIgnorePatterns: [
        "node_modules/(?!(@bhaav/core|react-native|@react-native|expo|@expo|@testing-library/react-native))",
      ],
```

Change only the projects Step 2 identified. Do not restructure projects that already pass.

- [ ] **Step 4: Run and iterate on the remaining failures**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/client/app" && npx jest 2>&1 | tail -20
```

Suites must now *execute*. If a suite runs and then fails on a real assertion, that is a genuine finding — **report it, do not fix the source.** Your boundary is the Jest config. A suite that was dead for weeks may be asserting against code that has since changed.

- [ ] **Step 5: Report the true count**

Run: `cd "/Users/solminde/Developer/Personal/SIH(2026)/client/app" && npx jest 2>&1 | tail -6`

Record suites executed and tests passed/failed. The honest success condition is **19 of 19 suites execute**; passing assertions is a separate question you report on.

- [ ] **Step 6: Commit**

```bash
git add client/app/jest.config.js
git commit -m "test(app): give the RN-dependent jest projects the expo babel preset

Six of nineteen suites died at transform time on Flow-typed
@react-native/js-polyfills sources and never ran, while the summary still
reported 60 passing tests."
```

---

### Task 3: Stop vitest collecting the Playwright specs

`client/console/vitest.config.js` declares no `include`/`exclude`, so vitest collects `test/e2e/*.spec.js` — Playwright specs that cannot run under vitest and always fail.

**Files:**
- Modify: `client/console/vitest.config.js`

**Interfaces:**
- Consumes: nothing
- Produces: no source change.

- [ ] **Step 1: Baseline**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/client/console" && npx vitest run --reporter=dot 2>&1 | tail -8
```

Record which files fail and note which are `test/e2e/*.spec.js`.

- [ ] **Step 2: Scope the collection**

Replace the `test` block in `client/console/vitest.config.js` with:

```js
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.js"],
    // Playwright owns test/e2e/*.spec.js and runs them in a real browser.
    // Without an explicit scope vitest also collects them, and they fail every
    // run on Playwright-only globals — noise that hides real failures.
    include: ["test/**/*.test.{js,jsx}"],
    exclude: ["node_modules/**", "test/e2e/**"],
  },
```

- [ ] **Step 3: Verify the e2e specs are no longer collected**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/client/console" && npx vitest run --reporter=dot 2>&1 | tail -8
```

Expected: no `e2e` file appears. Remaining failures in `verify.test.jsx`, `AcceptanceList.test.jsx`, `lib/api.test.jsx` are **real and pre-existing** — report them with their assertion messages; do not fix them in this task.

- [ ] **Step 4: Confirm Playwright still sees its specs**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/client/console" && npx playwright test --list 2>&1 | tail -12
```

Expected: the e2e specs are still listed. If `--list` cannot run without a server, say so rather than claiming success.

- [ ] **Step 5: Commit**

```bash
git add client/console/vitest.config.js
git commit -m "test(console): scope vitest to unit tests, leave e2e to playwright

vitest collected test/e2e/*.spec.js and failed them every run, masking the
real unit-test failures underneath."
```

---

### Task 4: Batch `/sync/push` without losing per-record semantics

`POST /sync/push` applies records in a sequential `for` loop with an `await` per record (`server/api/src/routes/sync.js`, the `for (const record of sorted)` block). Against a remote database a 200-record batch is 200 serial round trips and exceeds 15 seconds. This is the offline-sync path — the headline claim.

**The per-record semantics are correct and must survive:** good records land, bad ones come back with a reason, and one bad record never fails the batch. Only the serialisation changes.

**Files:**
- Modify: `server/api/src/routes/sync.js` — the record loop in `POST /push`
- Test: `server/api/test/sync-push.test.js` (existing — must still pass unmodified)

**Interfaces:**
- Consumes: existing `writers`, `validateRecord`
- Produces: `POST /sync/push` response shape unchanged — `{ applied, rejected }` with the same per-record reasons.

- [ ] **Step 1: Measure the baseline**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api"
npx vitest run test/sync-push.test.js --reporter=verbose 2>&1 | grep -E "200-record|Tests|ms"
```

Record the wall time of the 200-record test.

- [ ] **Step 2: Read the loop and list what makes ordering matter**

Read the `for (const record of sorted)` block. `sorted` implies a deliberate order. Write down which record types depend on an earlier record existing (a handover needs its lot; an acceptance needs its lot). **Records of different types may not be freely reordered.** Report your finding before changing anything.

- [ ] **Step 3: Chunk within order-safe groups only**

Keep the outer ordering. Inside it, process order-independent records concurrently in bounded chunks:

```js
    // Per-record semantics are deliberate: good records land, bad ones come back
    // with a reason, and one bad record never fails the batch. That does NOT
    // require them to be serial — 200 records was 200 sequential round trips
    // against a remote database, >15s for a batch a returning collector can
    // easily produce after a day offline.
    //
    // Bounded concurrency, and only WITHIN a group that carries no ordering
    // dependency. Cross-type ordering (lot before acceptance before handover) is
    // preserved by processing the groups in sequence.
    const CHUNK = 20;
    for (const group of orderedGroups) {
      for (let i = 0; i < group.length; i += CHUNK) {
        const results = await Promise.allSettled(
          group.slice(i, i + CHUNK).map((record) => applyOne(record)),
        );
        // ...fold results into `applied` / `rejected` exactly as the serial
        // version did, preserving each record's own reason.
      }
    }
```

Extract the existing per-record body into `applyOne(record)` unchanged. Do not alter validation, error text, or what is pushed onto `applied`/`rejected`.

- [ ] **Step 4: The existing tests must pass untouched**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api"
npx vitest run test/sync-push.test.js --reporter=verbose
```

Expected: all pass, **without modifying the test file**. If a test now fails, you changed the semantics — revert and rethink. Report the wall time of the 200-record test against Step 1.

- [ ] **Step 5: Add a test proving one bad record still does not fail the batch**

Append to `server/api/test/sync-push.test.js`:

```js
  it("still lands the good records when one in the middle of a chunk is invalid", async () => {
    // The property chunking must not break: partial success with a per-record
    // reason. Serial code got this for free; concurrent code has to prove it.
    const records = [];
    for (let i = 0; i < 25; i += 1) {
      records.push(validLotRecord({ index: i }));
    }
    records[12] = { ...records[12], payload: { ...records[12].payload, quantity: -5 } };

    const res = await request(app).post("/sync/push").send({ records });

    expect(res.status).toBe(200);
    expect(res.body.applied).toHaveLength(24);
    expect(res.body.rejected).toHaveLength(1);
    expect(res.body.rejected[0].reason).toBeTruthy();
  });
```

Adapt `validLotRecord` to whatever fixture helper the file already uses — read it first; do not invent a helper.

- [ ] **Step 6: Full suite**

Run: `cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api" && npx vitest run --reporter=dot`

Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add server/api/src/routes/sync.js server/api/test/sync-push.test.js
git commit -m "perf(api): apply /sync/push records in bounded concurrent chunks

200 records was 200 sequential round trips against a remote database. Ordering
between record types and per-record partial-success semantics are both
preserved; only same-group records now overlap."
```

---

### Task 5: Fail-open SMS library and recycler notifications

**Files:**
- Create: `server/api/src/lib/sms.js`
- Create: `server/api/test/sms.test.js`
- Modify: `server/api/src/routes/recycler.js` — the acceptance-respond handler
- Modify: `.env.example`

**Interfaces:**
- Consumes: `FAST2SMS_API_KEY`, `SMS_ENABLED`, `SMS_ALLOWLIST`, `SMS_DRY_RUN`, `SMS_TIMEOUT_MS`
- Produces:
  - `sendSms({ numbers, message }) -> Promise<{ ok: true, body } | { ok: false, reason }>`
  - `smsEnabled() -> boolean`
  - Never throws. Never awaited on a request path.

**Verified API contract** (docs.fast2sms.com, fetched 2026-09-06):
`GET https://www.fast2sms.com/dev/bulkV2?route=q&message=<text>&numbers=<csv>` with header `Authorization: <API_KEY>` — raw key, **no `Bearer` prefix**. Route `q` (Quick SMS) needs **no DLT registration**. Route `dlt` needs a DLT-approved `sender_id` plus an approved template id and is explicitly out of scope.

- [ ] **Step 1: Verify the files do not already exist**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)"
ls server/api/src/lib/sms.js server/api/test/sms.test.js 2>/dev/null && echo "EXISTS — STOP AND REPORT" || echo "absent — safe to create"
```

- [ ] **Step 2: Write the failing tests**

Create `server/api/test/sms.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSms, smsEnabled } from "../src/lib/sms.js";

const OLD = { ...process.env };

beforeEach(() => {
  process.env.FAST2SMS_API_KEY = "test-key";
  process.env.SMS_ENABLED = "true";
  process.env.SMS_DRY_RUN = "false";
  delete process.env.SMS_ALLOWLIST;
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...OLD };
});

describe("sendSms", () => {
  it("is disabled unless SMS_ENABLED is explicitly true", async () => {
    // Default-off matters: the 155 seeded numbers are real businesses on a
    // government register. An accidental broadcast is a real-world harm.
    process.env.SMS_ENABLED = "false";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(smsEnabled()).toBe(false);
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends via route=q with the key in the Authorization header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ return: true, request_id: "abc" }),
    });

    const res = await sendSms({ numbers: "9999999999", message: "hello" });

    expect(res.ok).toBe(true);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("https://www.fast2sms.com/dev/bulkV2");
    expect(String(url)).toContain("route=q");
    expect(String(url)).toContain("numbers=9999999999");
    expect(opts.headers.Authorization).toBe("test-key");
    expect(opts.headers.Authorization).not.toContain("Bearer");
  });

  it("sends to nobody outside the allowlist when one is set", async () => {
    // The single most important guard while building: point SMS_ALLOWLIST at
    // your own phone and an accidental broadcast becomes structurally impossible.
    process.env.SMS_ALLOWLIST = "8888888888";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ return: true }),
    });

    const res = await sendSms({ numbers: "9999999999,8888888888", message: "hi" });

    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("numbers=8888888888");
    expect(String(url)).not.toContain("9999999999");
    expect(res.ok).toBe(true);
  });

  it("returns ok:false and sends nothing when every number is filtered out", async () => {
    process.env.SMS_ALLOWLIST = "8888888888";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails open on a network error rather than throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.ok).toBe(false);
    expect(res.reason).toContain("ECONNREFUSED");
  });

  it("fails open on a non-200 rather than throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 401, json: async () => ({ message: "unauthorized" }),
    });

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.ok).toBe(false);
    expect(res.reason).toContain("401");
  });

  it("does not call the network in dry-run but reports ok", async () => {
    process.env.SMS_DRY_RUN = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never puts the api key in the returned reason", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom test-key leaked"));

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.reason).not.toContain("test-key");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api" && npx vitest run test/sms.test.js --reporter=verbose`

Expected: FAIL — `Cannot find module '../src/lib/sms.js'`.

- [ ] **Step 4: Implement the library**

Create `server/api/src/lib/sms.js`:

```js
import { log } from "./logger.js";

/**
 * Fast2SMS sender. Modelled on lib/aiml.js: every failure is returned, never
 * thrown, because every caller is a fire-and-forget side effect on a request
 * path that must not be blocked by a third party.
 *
 * Route "q" (Quick SMS) is used deliberately: it needs no DLT registration,
 * which is a weeks-long process requiring a registered legal entity. DLT is the
 * production path and is out of scope here.
 *
 * THREE INDEPENDENT SAFETY GUARDS, because the numbers in this database are
 * real businesses on a government register and an accidental broadcast is a
 * real-world harm, not a test failure:
 *   1. SMS_ENABLED must be explicitly "true"
 *   2. SMS_ALLOWLIST, when set, is the ONLY set of numbers that can receive
 *   3. SMS_DRY_RUN logs what would be sent and touches no network
 */
const BASE = "https://www.fast2sms.com/dev/bulkV2";

export function smsEnabled() {
  return process.env.SMS_ENABLED === "true";
}

function allowlist() {
  const raw = process.env.SMS_ALLOWLIST;
  if (!raw) return null;
  return new Set(raw.split(",").map((n) => n.trim()).filter(Boolean));
}

function redact(text, key) {
  if (!key || !text) return text;
  return String(text).split(key).join("<redacted>");
}

export async function sendSms({ numbers, message }) {
  const key = process.env.FAST2SMS_API_KEY;

  if (!smsEnabled()) return { ok: false, reason: "SMS_ENABLED is not true" };
  if (!key) return { ok: false, reason: "FAST2SMS_API_KEY is not configured" };

  const requested = String(numbers ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  const allow = allowlist();
  const permitted = allow ? requested.filter((n) => allow.has(n)) : requested;

  if (permitted.length === 0) {
    return { ok: false, reason: allow ? "every number filtered by SMS_ALLOWLIST" : "no numbers" };
  }

  if (process.env.SMS_DRY_RUN === "true") {
    log.sms?.info?.("dry-run", { to: permitted.join(","), message });
    return { ok: true, dryRun: true, to: permitted };
  }

  const url = `${BASE}?route=q&message=${encodeURIComponent(message)}&numbers=${encodeURIComponent(permitted.join(","))}`;
  const ms = Number(process.env.SMS_TIMEOUT_MS ?? 3000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: key },
      signal: controller.signal,
    });

    if (!res.ok) return { ok: false, reason: `fast2sms responded ${res.status}` };

    const body = await res.json();
    return { ok: true, body, to: permitted };
  } catch (err) {
    const reason = err.name === "AbortError" ? `timeout after ${ms}ms` : err.message;
    return { ok: false, reason: redact(reason, key) };
  } finally {
    clearTimeout(timer);
  }
}
```

If `log.sms` does not exist on the logger, read `server/api/src/lib/logger.js` and use whichever namespace the module actually provides. Do not invent one.

- [ ] **Step 5: Run to verify they pass**

Run: `cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api" && npx vitest run test/sms.test.js --reporter=verbose`

Expected: 8 passed.

- [ ] **Step 6: Notify the recycler when a collector accepts**

Find the acceptance-creation path that a collector's acceptance reaches (`POST /sync/push` writes acceptances; read how they land). Add, after the acceptance row commits and **without awaiting**:

```js
    // The recycler is not sitting in the console all day. "A collector is on
    // their way" is the message that has value. Fire-and-forget and fail-open:
    // an SMS outage must never affect whether the acceptance was recorded.
    if (smsEnabled() && recycler?.phone) {
      void sendSms({
        numbers: recycler.phone,
        message: `Bhaav: new acceptance. ${categoryCode} ${quantity}kg, ref ${referenceCode}. Collector arriving. Open console to respond.`,
      }).then((r) => {
        if (!r.ok) log.sms?.warn?.("acceptance sms failed", { reason: r.reason });
      });
    }
```

The message carries **no collector identity** — that is required by the project's own no-personal-data ground rule.

- [ ] **Step 7: Add the env keys**

Append to `.env.example`:

```
# Fast2SMS — route "q" (Quick SMS) needs no DLT registration.
# SMS_ENABLED defaults OFF. The seeded recycler numbers are REAL businesses from
# the MPCB register; set SMS_ALLOWLIST to your own phone for the whole build and
# an accidental broadcast becomes structurally impossible.
FAST2SMS_API_KEY=""
SMS_ENABLED="false"
SMS_DRY_RUN="true"
SMS_ALLOWLIST=""
SMS_TIMEOUT_MS=3000
```

- [ ] **Step 8: Full suite and commit**

Run: `cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api" && npx vitest run --reporter=dot` → 0 failures.

```bash
git add server/api/src/lib/sms.js server/api/test/sms.test.js server/api/src/routes/recycler.js .env.example
git commit -m "feat(api): fail-open Fast2SMS sender and recycler acceptance alerts

Route q, no DLT registration needed. Default-off plus an allowlist plus
dry-run, because the seeded numbers are real businesses on a public register."
```

---

### Task 6: Optional collector contact and collector-facing SMS

Collectors are pseudonymous by design and must stay so. `README.md` ground rule 7 says "no **mandatory** phone" — an optional one is permitted. `DB.md` §3.1 argues the `collector` table's four columns are themselves the DPDP answer, so the number goes in a **separate table**, keeping that argument true word-for-word and making erasure a single statement you can demonstrate.

**Files:**
- Modify: `server/api/prisma/schema.prisma` — add `CollectorContact`
- Create: `server/api/prisma/migrations/<timestamp>_collector_contact/migration.sql`
- Modify: `server/api/src/routes/public.js` — opt-in and delete endpoints
- Create: `server/api/test/collector-contact.test.js`

**Interfaces:**
- Produces:
  - `POST /public/collector/:id/contact` `{ phone }` → 201 `{ ok: true }`
  - `DELETE /public/collector/:id/contact` → 200 `{ ok: true }` (erasure, idempotent)
  - Model `CollectorContact { collectorId @id, phone, consentTs, createdAt }`

- [ ] **Step 1: Verify the model does not already exist**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)"
grep -n "CollectorContact\|collector_contact" server/api/prisma/schema.prisma || echo "absent — safe to add"
```

- [ ] **Step 2: Write the failing tests**

Create `server/api/test/collector-contact.test.js` with these cases — write the bodies using the helper conventions already in `server/api/test/helpers/db.js` (`makeCollector`), which you must read first:

1. `stores a number with a consent timestamp when a collector opts in`
2. `deletes the number on request — the DPDP erasure right, in one statement`
3. `deleting a number that was never given succeeds anyway (idempotent)`
4. `keeps the collector table at four columns — the number lives in a separate table` — assert `collector` has no `phone` column via `prisma.$queryRaw` against `information_schema.columns`
5. `rejects a phone that is not ten digits`

- [ ] **Step 3: Run to verify they fail**

Run: `cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api" && npx vitest run test/collector-contact.test.js --reporter=verbose`

- [ ] **Step 4: Add the model**

Append to `server/api/prisma/schema.prisma`:

```prisma
// The collector's number lives HERE, not on `collector`, on purpose. DB.md 3.1
// argues that the collector table's four columns are themselves the DPDP
// answer; a nullable phone there would cost that argument. A separate table
// keeps it true, gives consent_ts somewhere to live, and makes erasure a single
// DELETE that can be demonstrated live.
//
// Strictly optional. The app must behave identically when no row exists —
// README ground rule 7 permits an optional phone, never a mandatory one.
model CollectorContact {
  collectorId String   @id @map("collector_id") @db.Uuid
  phone       String
  consentTs   DateTime @map("consent_ts") @db.Timestamptz(6)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  collector Collector @relation(fields: [collectorId], references: [id], onDelete: Cascade)

  @@map("collector_contact")
}
```

Add the back-relation `contact CollectorContact?` to the `Collector` model.

- [ ] **Step 5: Generate and apply the migration**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/server/api"
npx prisma migrate dev --name collector_contact --create-only
```

Read the generated SQL before applying it. Then `npx prisma migrate deploy` and `npx prisma generate`.

- [ ] **Step 6: Add the endpoints, then notify on accept/decline**

In `server/api/src/routes/public.js` add the two endpoints (no auth — the collector is pseudonymous and holds no session). Then, wherever a recycler responds to an acceptance, send the collector an SMS **only if a contact row exists**:

```js
      // Optional by construction: no row, no message, no behaviour change.
      const contact = await prisma.collectorContact.findUnique({
        where: { collectorId: lot.collectorId },
      });
      if (smsEnabled() && contact) {
        void sendSms({
          numbers: contact.phone,
          message: accepted
            ? `Bhaav: ${recycler.name} confirmed your lot. ${categoryCode} ${quantity}kg, ref ${referenceCode}. They are expecting you.`
            : `Bhaav: ${recycler.name} declined lot ${referenceCode}. Open the app to pick another recycler.`,
        }).then((r) => { if (!r.ok) log.sms?.warn?.("collector sms failed", { reason: r.reason }); });
      }
```

- [ ] **Step 7: Verify, then commit**

Run the new test file, then the full suite. Both must be green.

```bash
git add server/api/prisma/schema.prisma server/api/prisma/migrations server/api/src/routes/public.js server/api/test/collector-contact.test.js
git commit -m "feat(api): optional collector contact in a separate table

Keeps the collector table at four columns so DB.md 3.1's DPDP argument stays
true, gives consent_ts a home, and makes erasure a single demonstrable DELETE."
```

---

### Task 7: Extract the console components from `verify/page.jsx`

Plan 03 tasks 5–6 specified `HandoverForm`, `QrScanner` and `FlagCard`. The logic works but lives inline in a 297-line page.

**Files:**
- Create: `client/console/src/components/HandoverForm.jsx`, `QrScanner.jsx`, `FlagCard.jsx`
- Modify: `client/console/src/app/(protected)/verify/page.jsx`, `client/console/src/app/(protected)/flags/page.jsx`
- Test: `client/console/test/verify.test.jsx` (existing — currently failing; see below)

**This is a pure refactor. No behaviour change.**

> `verify.test.jsx` is already failing before you start (pre-existing). Record its exact failure first, and make sure your refactor does not change it. If your change fixes it incidentally, say so; if it makes it worse, revert.

- [ ] **Step 1: Baseline** — `cd client/console && npx vitest run --reporter=verbose 2>&1 | tail -30`. Record every failing assertion verbatim.
- [ ] **Step 2:** Extract `QrScanner` (the `html5-qrcode` wrapper) with props `{ onScan, onError }`. Page behaviour identical.
- [ ] **Step 3:** Extract `HandoverForm` with props `{ lot, onSubmit, submitting }`, carrying the condition radios, the downgrade-reason `select` that appears only when `inspectedCondition !== lot.condition`, and the submit button.
- [ ] **Step 4:** Extract `FlagCard` with props `{ flag }`, carrying the severity badge and plain-language line currently inline in `flags/page.jsx`.
- [ ] **Step 5:** Re-run. The set of passing and failing tests must be **identical** to Step 1.
- [ ] **Step 6: Commit**

```bash
git add client/console/src/components/HandoverForm.jsx client/console/src/components/QrScanner.jsx client/console/src/components/FlagCard.jsx "client/console/src/app/(protected)/verify/page.jsx" "client/console/src/app/(protected)/flags/page.jsx"
git commit -m "refactor(console): extract HandoverForm, QrScanner and FlagCard

Plan 03 tasks 5-6. No behaviour change; verify/page.jsx was 297 lines."
```

---

### Task 8: Single-source the condition factors, fix the `ids.js` comment

The three condition factors are written down in **three** places: the `condition_factor` DB table, `packages/core/src/pricing.js`, and hardcoded inline at `packages/core/src/ranking.js:96`. `README.md` ground rule 5 says field data will replace these numbers — when it does, the ranking would silently keep scoring on the old ones.

**Files:**
- Modify: `packages/core/src/ranking.js`, `packages/core/src/pricing.js`, `packages/core/src/ids.js`
- Test: `packages/core/test/ranking.test.js`

- [ ] **Step 1:** Add a failing test asserting `rankRecyclers` and `estimateValue` agree on the same lot — same quantity, unit price and condition must produce the same rupee value.
- [ ] **Step 2:** Run it. It may already pass by coincidence (the numbers are currently identical); if so, change `CONDITION_FACTORS.FAIR` in `pricing.js` to `0.5` temporarily and confirm the test then FAILS. That proves the test actually binds the two together. Restore `0.85`.
- [ ] **Step 3:** Export `conditionFactorFor` from `pricing.js` and import it in `ranking.js`, replacing the inline `{ GOOD: 1.0, FAIR: 0.85, POOR: 0.70 }` literal. Watch for an import cycle — if one appears, move the constant into `constants.js` and have both import from there.
- [ ] **Step 4:** Fix the false comment at the top of `packages/core/src/ids.js`. It claims the server uses "its own copy of this logic" with `node:crypto`; every server usage imports from `@bhaav/core/ids`. Replace it with what is actually true.
- [ ] **Step 5:** `cd packages/core && npx vitest run` → all pass.
- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ranking.js packages/core/src/pricing.js packages/core/src/ids.js packages/core/test/ranking.test.js
git commit -m "fix(core): single-source the condition factors

ranking.js hardcoded its own copy, so field data replacing the stated
assumption would have updated pricing and silently left ranking behind."
```

---

### Task 9: The authorisation-evidence panel

A tick on every recycler carries zero information, because the list is already filtered to `VALID`. The demonstrable thing is the **filtering itself**.

**Files:**
- Modify: `client/app/src/screens/ValueScreen.jsx` (or the price-board screen), `client/console/src/app/(protected)/rates/page.jsx`
- Test: matching test files

Target copy, rendered from live data, never hardcoded:

> **74 of 161 MPCB-listed facilities are currently authorised. 87 have lapsed and are hidden. List last refreshed 2026-09-04.**

- [ ] **Step 1:** `GET /public/authorisation` already exists (`server/api/test/authorisation.test.js` covers it). Read it and confirm the counts and `fetchedOn` it returns. Do not add an endpoint if one already serves this.
- [ ] **Step 2:** Write failing tests asserting the panel renders counts from the API response, not literals.
- [ ] **Step 3:** Implement in both surfaces. Per recycler, show its authorisation validity date and the source reference.
- [ ] **Step 4:** Honesty guard — the copy must never imply a lapsed facility is unlawful. `README.md` ground rule 1: `LAPSED_IN_LIST` means the published record shows an expired date, and many will have renewed without MPCB republishing. Use "hidden", never "illegal" or "unauthorised operator".
- [ ] **Step 5:** Tests pass; commit.

---

### Task 10: `npm run mpcb:refresh`

`server/api/src/lib/mpcbSource.js` already carries the dated provenance. What is missing is the documented refresh path.

- [ ] **Step 1:** Read `server/api/src/lib/mpcbSource.js` and `server/api/seed/seed.js` to learn the CSV shape and the `fetchedOn` convention.
- [ ] **Step 2:** Create `server/api/scripts/mpcb-refresh.js` that re-parses a dropped-in CSV, updates `authorizationStatus`/`validityTo`, and **requires** the `fetchedOn` date to be updated in the same run — refusing to proceed if it was not.
- [ ] **Step 3:** Add `"mpcb:refresh": "node scripts/mpcb-refresh.js"` to `server/api/package.json`.
- [ ] **Step 4:** Test against a small fixture CSV. Assert it is idempotent and that it refuses a stale `fetchedOn`.
- [ ] **Step 5:** Commit.

---

### Task 11: Critical Mineral Ledger

`Category.criticalMinerals` is already in the schema and already seeded. What is missing is the coefficient and the aggregation.

**⚠️ The engineering here is trivial; the real work is sourcing ~10 coefficients from a citable published source. DO NOT INVENT A SINGLE NUMBER.** A judge from the Ministry of Mines — the sponsoring ministry — will know these figures. If you cannot source a coefficient, omit that mineral and say so.

- [ ] **Step 1:** Add `MineralCoefficient { categoryCode, mineral, gramsPerKg, sourceCitation, sourceYear, @@id([categoryCode, mineral]) }` plus a migration.
- [ ] **Step 2:** Seed **only** coefficients you can cite, each with its real `sourceCitation` and `sourceYear`. Report exactly which you sourced and from where; report which you could not.
- [ ] **Step 3:** Add the aggregation: `Σ (handover.inspectedQuantity × gramsPerKg)` **`WHERE handover.status = 'CONFIRMED'`** grouped by mineral, month and district. Counting unconfirmed handovers would let anyone inflate a national mineral figure by photographing a pile; the two-signature constraint is what makes the number defensible.
- [ ] **Step 4:** Surface it in the console with the citation rendered **in the UI**, not just the deck, and every figure labelled `ESTIMATED`.
- [ ] **Step 5:** Tests: confirmed-only, correct grouping, citation present on every row.
- [ ] **Step 6:** Commit.

---

### Task 12: Bring every document in line with what was built

**Run this LAST.** It must describe the finished state, not the intended one.

**Files:** `FLOW.md`, `flow_audit.md`, `README.md`, `AI.md`, `SERVER.md`, `DB.md`, `FRONTEND.md`, `PRODUCT.md`, `AI-ANOMALY-SPEC.md`

- [ ] **Step 1: Establish ground truth first.** Run every suite and `git log --oneline` since `f11d8fd`. Write the actual state down before editing prose. Do not describe anything you have not verified.

- [ ] **Step 2: Reconcile the detector-code range.** It is currently documented **four incompatible ways**: `SERVER.md` §3 says `D1..D8`, `DB.md` §3.9 says `D1..D13`, `AI.md` §10 puts seven in scope while §5 lists nine, and `AI-ANOMALY-SPEC.md` adds D9–D14. Pick the truth from `server/aiml/bhaav_aiml/config.py::IN_SCOPE` and make all four files agree. **Ask Leader 2 for the final list before writing it** — they are actively changing D10 and D12.

- [ ] **Step 3: Update the ranking description everywhere.** Any document describing the old `rateMatch` scoring is now wrong. The score is `value 0.55 − distance 0.30 + pickup 0.10 − staleness 0.05`, and the reason matters: scoring on closeness-to-expectation penalised a recycler for paying *more*.

- [ ] **Step 4: Update the detection flow.** Detection now fires automatically after every confirmed handover, and the console has an operator-triggered run. Any text implying detectors run only on demand — or not at all — is stale.

- [ ] **Step 5: Reverse the SMS decision in the docs.** SMS was previously listed as deliberately-not-built. It now exists: recycler alerts on acceptance, optional collector alerts via `collector_contact`, Fast2SMS route `q`, DLT registration named as the production path. Update the "deliberately not built" lists so they do not contradict shipped code.

- [ ] **Step 6: Regenerate `flow_audit.md`** against the current code. Its two stated gaps must be re-checked; add any new ones.

- [ ] **Step 7: Record what is still NOT done**, plainly, in `README.md`. As of this plan: the AI model payload sends the same value for `reference_price` and `buyer_offer_per_kg`, so two of that model's five features carry no information; the Hazard Gap detector is unbuilt; D4/D5 remain out of scope.

- [ ] **Step 8:** Commit as `docs: bring the flows and specs in line with what was built`.

---

## Final verification

- [ ] `npx vitest run` from repo root → 0 failures
- [ ] `cd client/console && npx vitest run` → 0 failures
- [ ] `cd client/app && npx jest` → 19/19 suites execute
- [ ] `git grep -n "rateMatch\|collectorExpectedRate"` → no output
- [ ] No document contradicts `server/aiml/bhaav_aiml/config.py::IN_SCOPE` on the detector range
- [ ] `SMS_ENABLED` defaults to `false` and `SMS_ALLOWLIST` is documented in `.env.example`

---

### Task 13: Fix the seven real console unit-test failures

Task 3 removed the Playwright noise that was hiding these. They are genuine and pre-existing.

**Files:**
- Modify: `client/console/test/verify.test.jsx`, `client/console/test/AcceptanceList.test.jsx`, `client/console/test/lib/api.test.jsx`
- Modify source **only** if the test proves the source is wrong — and say so with evidence

**The four `verify.test.jsx` failures have a confirmed cause.** `client/console/src/app/(protected)/verify/page.jsx:3` imports `useSearchParams` and calls it at line 30, but `verify.test.jsx:7` mocks only `useRouter`:

```js
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
```

`Nav.jsx` needs `useRouter`; the page needs `useSearchParams`. The mock must provide both:

```js
// The page uses useSearchParams (verify/page.jsx:30) and Nav uses useRouter.
// A partial mock of next/navigation throws "No <hook> export is defined",
// which is why these four never got as far as their assertions.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/verify",
}));
```

**The other three are undiagnosed.** `AcceptanceList` "acknowledges a row" / "declines a row" expect the spy called with `['a1', 'ACKNOWLEDGED']` / `['a1', 'DECLINED']`; `lib/api.test.jsx` "sends credentials so the session cursor rides along" expects two specific args. For each: determine whether the TEST is stale or the SOURCE is wrong. `AgentContext.md` records that the console's acceptance response values were changed at some point (`recyclerResponse NONE→ACKNOWLEDGED`), so a stale expectation is plausible — but verify it, do not assume it.

- [ ] **Step 1:** Baseline — `cd "/Users/solminde/Developer/Personal/SIH(2026)/client/console" && npx vitest run --reporter=verbose 2>&1 | tail -40`. Record all 7 failures verbatim.
- [ ] **Step 2:** Apply the `next/navigation` mock fix above. Re-run. Expect the 4 `verify.test.jsx` failures to clear.
- [ ] **Step 3:** For each remaining failure, read BOTH the test and the component it exercises. State in your report which is wrong and why, with the line numbers.
- [ ] **Step 4:** Fix the wrong side. If you change a component, the burden of proof is higher — explain what user-visible behaviour was broken.
- [ ] **Step 5:** `npx vitest run --reporter=dot` → **8 files, 0 failures.**
- [ ] **Step 6:** Commit as `fix(console): repair the unit tests unmasked by scoping vitest`.

---

### Task 14: Make the four revived `components` suites actually pass

Task 2 got all 19 `client/app` suites to EXECUTE. Four now run and fail: `test/i18n/useStrings.test.js`, `test/ui/Text.test.js`, `test/ui/Button.test.js`, `test/components/CategoryIcon.test.js` — 27 failing tests, every one with the same error from `@testing-library/react-native`'s `detectHostComponentNames`:

```
Element type is invalid: expected a string (for built-in components) or a class/function
(for composite components) but got: undefined.
```

**Two facts that should shape your diagnosis:**

1. **These suites have never passed.** They were committed in `f6ec3e8` and were dead at transform time from that moment until Task 2. They were never green, so do not assume the components regressed — the tests themselves may never have been correct.
2. **The `components` project now carries BOTH `preset: "jest-expo/android"` AND a custom `transform` override** added by Task 2. `jest-expo` ships its own transform, `transformIgnorePatterns`, `setupFiles` and `moduleNameMapper`; a bare `transform` override can bypass the setup that registers React Native's host components — which is exactly what `detectHostComponentNames` fails to find.

Task 2's agent already ruled out the obvious explanation: `Button`, `Text` and `CategoryIcon` are correctly named-exported and correctly named-imported. Versions look mutually compatible (react-native 0.76.5, jest-expo 52.0.6, @testing-library/react-native 12.9.0, react 18.3.1).

**Files:**
- Modify: `client/app/jest.config.js` and/or `client/app/babel.config.js`
- Modify: the four test files, **only** if you prove the tests are wrong
- Modify `client/app/src/**` only with a high burden of proof and a clear statement of the user-visible bug

- [ ] **Step 1:** Baseline. `cd "/Users/solminde/Developer/Personal/SIH(2026)/client/app" && npx jest 2>&1 | tail -40`. Record the 27 failures and confirm all four suites share one error shape.

- [ ] **Step 2:** Test the leading hypothesis first — that Task 2's `transform` override is fighting the `jest-expo/android` preset. Temporarily remove the override from the `components` project only, leaving `preset: "jest-expo/android"` in place, and run. Report what happens. If the transform error returns, the real fix is upstream in `babel.config.js` (make it hand back `babel-preset-expo` under jest rather than branching to `@babel/preset-env`), **not** an override that discards the preset's setup.

- [ ] **Step 3:** Confirm the preset's setup files are actually loading. `jest-expo` registers RN host components through `setupFiles`/`setupFilesAfterEach`. If the project config overrides either key, the preset's entries are replaced rather than merged — check for that explicitly and report.

- [ ] **Step 4:** Fix the configuration so the four suites pass without weakening any assertion.

- [ ] **Step 5:** If, after the environment is genuinely correct, a test still fails on a real assertion, that is a finding about a never-verified test. **Report it; fix the test only if you can state precisely what correct behaviour it should have asserted.** Do not delete a test to go green.

- [ ] **Step 6:** `npx jest 2>&1 | tail -6` → **19 suites execute, 0 failures.** Report the honest number if you cannot reach it.

- [ ] **Step 7:** Commit as `test(app): repair the component suites that never ran`.

---

### Task 15: Build the console QR scanner

Task 7 discovered that `QrScanner` does not exist and never has. `html5-qrcode` is a declared dependency of `client/console` with **zero imports anywhere**. The collector's app renders a real QR (`client/app/src/screens/HandoverScreen.jsx:3`, `react-native-qrcode-svg`), but the recycler can only type the 8-character reference code by hand.

`FRONTEND.md:205` specifies *"Scan the QR (or type the reference)"* and `:231` lists a `QRPanel — generate and scan`. Generate exists; scan does not. This is the visual centrepiece of the two-sided handover.

**Files:**
- Create: `client/console/src/components/QrScanner.jsx`
- Modify: `client/console/src/app/(protected)/verify/page.jsx` — phase 1 only
- Create: `client/console/test/QrScanner.test.jsx`

**Interfaces:**
- Produces: `QrScanner({ onScan, onError, active })` — calls `onScan(decodedText)` once per successful decode and stops the camera immediately after.

**The demo constraint that shapes the design:** a browser camera can fail on stage — permission denied, no device, non-secure origin, bad lighting. **The manual reference-code input must remain visible and functional at all times, never hidden behind a failed scanner.** Scanning is the fast path, typing is the guaranteed path. That is also exactly what FRONTEND.md specifies.

- [ ] **Step 1:** Verify absence — `ls client/console/src/components/QrScanner.jsx` and `git show HEAD:client/console/src/components/QrScanner.jsx`. If either exists, STOP and report.

- [ ] **Step 2:** Write failing tests. `html5-qrcode` touches real hardware, so mock it — `vi.mock("html5-qrcode", ...)`. Cover:
  1. renders a "Scan QR" control when the browser reports a camera
  2. calls `onScan` with the decoded text and stops the scanner after the first successful decode
  3. surfaces a permission failure as readable text rather than a blank panel
  4. **the manual reference input is still present and usable after the scanner errors** — this is the demo-safety property and is the most important test in the file

- [ ] **Step 3:** Run them; confirm they fail for the stated reason.

- [ ] **Step 4:** Implement `QrScanner.jsx`. It must:
  - be a client component (`"use client"`)
  - start the camera only on an explicit user action, never on mount — an auto-starting camera on page load is hostile and will trip permission prompts mid-demo
  - stop and release the camera on unmount and after a successful scan (`html5-qrcode` leaves the stream open otherwise, and a live camera light during a pitch is a bad look)
  - degrade to a readable message when `navigator.mediaDevices` is unavailable

- [ ] **Step 5:** Wire it into `verify/page.jsx` phase 1 **alongside** the existing input. A successful scan fills the reference field and submits the same lookup the typed path uses — one code path, two entry points.

- [ ] **Step 6:** `cd client/console && npx vitest run --reporter=dot` → all green, and the existing `verify.test.jsx` must still pass **unmodified**.

- [ ] **Step 7:** Commit as `feat(console): QR scanning for the handover lookup, with manual entry preserved`.
