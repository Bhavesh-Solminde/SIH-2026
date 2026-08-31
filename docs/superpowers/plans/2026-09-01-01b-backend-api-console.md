# Backend API Implementation Plan, Part 2 — Console API and Detector Ingest

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Continues [part 1](2026-09-01-01-backend-api.md).** Task numbering carries on from task 11. Everything in part 1's Global Constraints and File Structure sections applies unchanged.

**Goal:** The recycler console's API surface — login, publishing rates, incoming acceptances, QR lookup, submitting a handover, the collector's counter-signature, photo upload, CSV export — plus the `/detect` orchestration that turns `server/aiml`'s findings into `anomaly_flag` rows.

---

## Task 12: Console session auth

`SERVER.md` §5: recycler console is email + password over HTTPS with server-side sessions, one account per authorised facility. The collector app has no auth at all and never sends a credential.

**Files:**
- Create: `server/api/src/routes/auth.js`, `server/api/src/middleware/session.js`
- Modify: `server/api/src/app.js`
- Test: `server/api/test/auth.test.js`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword` from `src/lib/password.js` (task 7)
- Produces: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; `requireRecycler` middleware that sets `req.recyclerId` and `req.accountId`

- [ ] **Step 1: Write the failing test**

`server/api/test/auth.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma, truncateAll, makeRecycler } from "./helpers/db.js";

const app = createApp();
let rec;

beforeEach(async () => {
  await truncateAll();
  rec = await makeRecycler({ name: "Bharat E Waste" });
  await prisma.recyclerAccount.create({
    data: {
      recyclerId: rec.id,
      email: "bharat@bhaav.demo",
      passwordHash: await hashPassword("bhaav-demo-2026"),
    },
  });
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("POST /auth/login", () => {
  it("issues an httpOnly session cookie on correct credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "bharat@bhaav.demo", password: "bhaav-demo-2026" });
    expect(res.status).toBe(200);
    expect(res.body.recycler.name).toBe("Bharat E Waste");
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/bhaav_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it("rejects a wrong password with the same message as an unknown email", async () => {
    const wrongPw = await request(app)
      .post("/auth/login")
      .send({ email: "bharat@bhaav.demo", password: "nope" });
    const wrongEmail = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@bhaav.demo", password: "bhaav-demo-2026" });
    expect(wrongPw.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect(wrongPw.body).toEqual(wrongEmail.body);
  });

  it("never returns the password hash", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "bharat@bhaav.demo", password: "bhaav-demo-2026" });
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt\$/);
  });
});

describe("GET /auth/me", () => {
  it("returns the signed-in facility", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ email: "bharat@bhaav.demo", password: "bhaav-demo-2026" });
    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.recycler.id).toBe(rec.id);
  });

  it("401s with no cookie", async () => {
    expect((await request(app).get("/auth/me")).status).toBe(401);
  });

  it("401s on a forged token", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "bhaav_session=made-up");
    expect(res.status).toBe(401);
  });

  it("401s once the session has expired", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ email: "bharat@bhaav.demo", password: "bhaav-demo-2026" });
    await prisma.recyclerSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await agent.get("/auth/me")).status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("destroys the session server-side, not just the cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ email: "bharat@bhaav.demo", password: "bhaav-demo-2026" });
    await agent.post("/auth/logout");
    expect(await prisma.recyclerSession.count()).toBe(0);
    expect((await agent.get("/auth/me")).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run server/api/test/auth.test.js
```

Expected: FAIL — 404 on `/auth/login`.

- [ ] **Step 3: Write `server/api/src/middleware/session.js`**

```js
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";

export const COOKIE = "bhaav_session";
const TTL_MS = 12 * 60 * 60 * 1000; // one working day at a facility

export async function createSession(accountId) {
  const token = randomBytes(32).toString("base64url");
  await prisma.recyclerSession.create({
    data: { token, accountId, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  return token;
}

export async function destroySession(token) {
  if (!token) return;
  await prisma.recyclerSession.deleteMany({ where: { token } });
}

export async function loadSession(token) {
  if (!token) return null;
  const row = await prisma.recyclerSession.findUnique({
    where: { token },
    include: { account: { include: { recycler: true } } },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    // Expire lazily. A cron to sweep sessions is not worth a table scan at
    // this volume, and a stale row must never authenticate.
    await prisma.recyclerSession.delete({ where: { token } }).catch(() => {});
    return null;
  }
  return row;
}

/**
 * Guards every /recycler route and the console side of /handover. The
 * collector app never passes through this — it has no credential by design
 * (SERVER.md section 5), and that is a privacy decision, not a shortcut.
 */
export async function requireRecycler(req, res, next) {
  try {
    const session = await loadSession(req.cookies?.[COOKIE]);
    if (!session) return res.status(401).json({ error: "unauthorised" });
    req.accountId = session.accountId;
    req.recyclerId = session.account.recyclerId;
    req.recycler = session.account.recycler;
    next();
  } catch (err) {
    next(err);
  }
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_MS,
    path: "/",
  });
}
```

- [ ] **Step 4: Write `server/api/src/routes/auth.js`**

```js
import { Router } from "express";
import { prisma } from "../db.js";
import { verifyPassword } from "../lib/password.js";
import {
  COOKIE,
  createSession,
  destroySession,
  requireRecycler,
  setSessionCookie,
} from "../middleware/session.js";

export const authRouter = Router();

const publicRecycler = (r) => ({
  id: r.id,
  name: r.name,
  address: r.address,
  district: r.district,
  authorizationStatus: r.authorizationStatus,
  materialsAccepted: r.materialsAccepted,
  pickupAvailable: r.pickupAvailable,
  serviceAreaKm: r.serviceAreaKm,
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const account = await prisma.recyclerAccount.findUnique({
      where: { email: String(email ?? "").toLowerCase() },
      include: { recycler: true },
    });

    // Always run the hash comparison, even with no account, so a wrong email
    // and a wrong password take the same time and return the same body.
    const ok = await verifyPassword(String(password ?? ""), account?.passwordHash ?? "scrypt$00$00");
    if (!account || !ok) return res.status(401).json({ error: "invalid_credentials" });

    setSessionCookie(res, await createSession(account.id));
    res.json({ recycler: publicRecycler(account.recycler) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    await destroySession(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: "/" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireRecycler, (req, res) => {
  res.json({ recycler: publicRecycler(req.recycler) });
});
```

- [ ] **Step 5: Mount it in `server/api/src/app.js`**

```js
import { authRouter } from "./routes/auth.js";
```

```js
  app.use("/auth", authRouter);
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/auth.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add server/api/src/routes/auth.js server/api/src/middleware/session.js server/api/src/app.js server/api/test/auth.test.js
git commit -m "feat(api): recycler console session auth with server-side session rows"
```

---

## Task 13: `POST /recycler/rates` — append-only publishing

**Files:**
- Create: `server/api/src/routes/recycler.js`
- Modify: `server/api/src/app.js`
- Test: `server/api/test/recycler-rates.test.js`

**Interfaces:**
- Consumes: `requireRecycler`
- Produces: `GET /recycler/rates -> { rates[] }` (current + `lastUpdatedDays` + `stale`), `POST /recycler/rates { rates: [{ categoryCode, unit, price }] } -> { published }`

`R1` in `FRONTEND.md` flags any rate untouched for over 7 days, and offers "copy yesterday's rates" — which on an append-only table means re-publishing the current values as new rows, not touching the old ones.

- [ ] **Step 1: Write the failing test**

`server/api/test/recycler-rates.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma, truncateAll, makeCategory, makeRecycler } from "./helpers/db.js";

const app = createApp();
let rec;
let pcb;
let cable;
let agent;

beforeEach(async () => {
  await truncateAll();
  rec = await makeRecycler();
  pcb = await makeCategory({ code: "PCB" });
  cable = await makeCategory({ code: "CABLE", nameEn: "Cable", iconKey: "cable" });
  await prisma.recyclerAccount.create({
    data: {
      recyclerId: rec.id,
      email: "r@bhaav.demo",
      passwordHash: await hashPassword("pw"),
    },
  });
  agent = request.agent(app);
  await agent.post("/auth/login").send({ email: "r@bhaav.demo", password: "pw" });
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("POST /recycler/rates", () => {
  it("inserts new rows and never updates an existing one", async () => {
    await agent.post("/recycler/rates").send({ rates: [{ categoryCode: "PCB", unit: "KG", price: 190 }] });
    await agent.post("/recycler/rates").send({ rates: [{ categoryCode: "PCB", unit: "KG", price: 205 }] });
    const rows = await prisma.rate.findMany({ orderBy: { validFrom: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => Number(r.price))).toEqual([190, 205]);
  });

  it("labels every published row RECYCLER_PUBLISHED", async () => {
    await agent.post("/recycler/rates").send({ rates: [{ categoryCode: "PCB", unit: "KG", price: 190 }] });
    const row = await prisma.rate.findFirst();
    expect(row.source).toBe("RECYCLER_PUBLISHED");
  });

  it("writes only against the signed-in recycler, never one named in the body", async () => {
    const other = await makeRecycler({ name: "Someone Else" });
    await agent
      .post("/recycler/rates")
      .send({ recyclerId: other.id, rates: [{ categoryCode: "PCB", unit: "KG", price: 1 }] });
    const row = await prisma.rate.findFirst();
    expect(row.recyclerId).toBe(rec.id);
  });

  it("publishes several categories in one call", async () => {
    const res = await agent.post("/recycler/rates").send({
      rates: [
        { categoryCode: "PCB", unit: "KG", price: 190 },
        { categoryCode: "CABLE", unit: "KG", price: 380 },
      ],
    });
    expect(res.body.published).toBe(2);
    expect(await prisma.rate.count()).toBe(2);
  });

  it("rejects a negative price", async () => {
    const res = await agent
      .post("/recycler/rates")
      .send({ rates: [{ categoryCode: "PCB", unit: "KG", price: -5 }] });
    expect(res.status).toBe(400);
    expect(await prisma.rate.count()).toBe(0);
  });

  it("rejects an unknown category code without publishing the rest of the batch", async () => {
    const res = await agent.post("/recycler/rates").send({
      rates: [
        { categoryCode: "PCB", unit: "KG", price: 190 },
        { categoryCode: "UNOBTAINIUM", unit: "KG", price: 1 },
      ],
    });
    expect(res.status).toBe(400);
    expect(await prisma.rate.count()).toBe(0);
  });

  it("401s without a session", async () => {
    const res = await request(app)
      .post("/recycler/rates")
      .send({ rates: [{ categoryCode: "PCB", unit: "KG", price: 1 }] });
    expect(res.status).toBe(401);
  });
});

describe("GET /recycler/rates", () => {
  it("returns the current rate per category with its age in days", async () => {
    await prisma.rate.create({
      data: {
        recyclerId: rec.id,
        categoryId: pcb.id,
        unit: "KG",
        price: "190.00",
        source: "RECYCLER_PUBLISHED",
        validFrom: new Date(Date.now() - 9 * 86_400_000),
      },
    });
    const res = await agent.get("/recycler/rates");
    const row = res.body.rates.find((r) => r.categoryCode === "PCB");
    expect(row.price).toBe(190);
    expect(row.lastUpdatedDays).toBe(9);
    expect(row.stale).toBe(true);
  });

  it("lists every category, including those with no rate yet", async () => {
    const res = await agent.get("/recycler/rates");
    expect(res.body.rates).toHaveLength(2);
    expect(res.body.rates.every((r) => r.price === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run server/api/test/recycler-rates.test.js
```

Expected: FAIL — 404.

- [ ] **Step 3: Write `server/api/src/routes/recycler.js`**

```js
import { Router } from "express";
import { prisma } from "../db.js";
import { UNITS } from "@bhaav/core/constants";
import { requireRecycler } from "../middleware/session.js";

export const recyclerRouter = Router();
recyclerRouter.use(requireRecycler);

const STALE_DAYS = 7; // FRONTEND.md R1
const DAY_MS = 86_400_000;

recyclerRouter.get("/rates", async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { code: "asc" } });
    const current = await prisma.$queryRaw`
      SELECT category_id, unit, price, valid_from
      FROM current_rate WHERE recycler_id = ${req.recyclerId}::uuid`;
    const byCategory = new Map(current.map((r) => [r.category_id, r]));

    res.json({
      rates: categories.map((c) => {
        const row = byCategory.get(c.id);
        const days = row ? Math.floor((Date.now() - row.valid_from.getTime()) / DAY_MS) : null;
        return {
          categoryId: c.id,
          categoryCode: c.code,
          nameEn: c.nameEn,
          nameMr: c.nameMr,
          defaultUnit: c.defaultUnit,
          unit: row?.unit ?? c.defaultUnit,
          price: row ? Number(row.price) : null,
          validFrom: row ? row.valid_from.toISOString() : null,
          lastUpdatedDays: days,
          stale: days !== null && days > STALE_DAYS,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

recyclerRouter.post("/rates", async (req, res, next) => {
  try {
    const rows = req.body?.rates;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "bad_request", detail: "rates must be a non-empty array" });
    }

    const codes = rows.map((r) => r.categoryCode);
    const categories = await prisma.category.findMany({ where: { code: { in: codes } } });
    const byCode = new Map(categories.map((c) => [c.code, c]));

    // Validate the whole batch before writing any of it. rate has no UPDATE,
    // so a half-applied publish cannot be rolled back by overwriting.
    const errors = [];
    for (const r of rows) {
      if (!byCode.has(r.categoryCode)) errors.push(`unknown category ${r.categoryCode}`);
      if (!UNITS.includes(r.unit)) errors.push(`${r.categoryCode}: unit must be one of ${UNITS.join(", ")}`);
      if (!(Number(r.price) >= 0)) errors.push(`${r.categoryCode}: price must be zero or greater`);
    }
    if (errors.length > 0) return res.status(400).json({ error: "bad_request", detail: errors });

    // recyclerId comes from the session, never from the body. A recycler
    // cannot publish on another facility's behalf.
    const created = await prisma.$transaction(
      rows.map((r) =>
        prisma.rate.create({
          data: {
            recyclerId: req.recyclerId,
            categoryId: byCode.get(r.categoryCode).id,
            unit: r.unit,
            price: Number(r.price).toFixed(2),
            source: "RECYCLER_PUBLISHED",
          },
        }),
      ),
    );

    res.status(201).json({ published: created.length });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Mount it in `server/api/src/app.js`**

```js
import { recyclerRouter } from "./routes/recycler.js";
```

```js
  app.use("/recycler", recyclerRouter);
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/recycler-rates.test.js
```

Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add server/api/src/routes/recycler.js server/api/src/app.js server/api/test/recycler-rates.test.js
git commit -m "feat(api): append-only rate publishing scoped to the signed-in facility"
```

---

## Task 14: Incoming acceptances and the respond action

**Files:**
- Modify: `server/api/src/routes/recycler.js`
- Test: `server/api/test/recycler-acceptances.test.js`

**Interfaces:**
- Produces: `GET /recycler/acceptances -> { acceptances[] }`, `POST /recycler/acceptances/:id/respond { response } -> { acceptance }`

`FRONTEND.md` R2: neither action is required, and **doing nothing means the collector arrives as planned** — the response payload says so explicitly so the UI can render that sentence rather than inventing it.

- [ ] **Step 1: Write the failing test**

`server/api/test/recycler-acceptances.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7 } from "@bhaav/core/ids";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
} from "./helpers/db.js";

const app = createApp();
let rec;
let other;
let cat;
let col;
let agent;

async function acceptance(recyclerId, over = {}) {
  const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
  return prisma.acceptance.create({
    data: {
      id: uuidv7(),
      lotId: lot.id,
      recyclerId,
      acceptedRate: "420.00",
      acceptedUnit: "KG",
      acceptedTs: new Date("2026-09-02T10:15:00+05:30"),
      ...over,
    },
  });
}

beforeEach(async () => {
  await truncateAll();
  rec = await makeRecycler({ name: "Mine" });
  other = await makeRecycler({ name: "Theirs" });
  cat = await makeCategory();
  col = await makeCollector();
  await prisma.recyclerAccount.create({
    data: { recyclerId: rec.id, email: "r@bhaav.demo", passwordHash: await hashPassword("pw") },
  });
  agent = request.agent(app);
  await agent.post("/auth/login").send({ email: "r@bhaav.demo", password: "pw" });
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("GET /recycler/acceptances", () => {
  it("returns only this facility's acceptances", async () => {
    await acceptance(rec.id);
    await acceptance(other.id);
    const res = await agent.get("/recycler/acceptances");
    expect(res.body.acceptances).toHaveLength(1);
  });

  it("carries the lot detail a recycler needs to decide", async () => {
    await acceptance(rec.id);
    const row = (await agent.get("/recycler/acceptances")).body.acceptances[0];
    expect(row).toMatchObject({
      categoryCode: "PCB",
      quantity: 3,
      unit: "KG",
      estimatedValue: 1260,
      acceptedRate: 420,
      condition: "GOOD",
    });
    expect(row.collectorId).toBe(col.id);
  });

  it("states that inaction means the collector still arrives", async () => {
    await acceptance(rec.id);
    const res = await agent.get("/recycler/acceptances");
    expect(res.body.inactionMeans).toBe("collector_arrives_as_planned");
  });

  it("carries no personal data about the collector", async () => {
    await acceptance(rec.id);
    const row = (await agent.get("/recycler/acceptances")).body.acceptances[0];
    expect(Object.keys(row)).not.toContain("collectorName");
    expect(Object.keys(row)).not.toContain("collectorPhone");
  });

  it("newest first", async () => {
    const older = await acceptance(rec.id, { acceptedTs: new Date("2026-09-01T10:00:00+05:30") });
    const newer = await acceptance(rec.id, { acceptedTs: new Date("2026-09-03T10:00:00+05:30") });
    const ids = (await agent.get("/recycler/acceptances")).body.acceptances.map((a) => a.id);
    expect(ids).toEqual([newer.id, older.id]);
  });
});

describe("POST /recycler/acceptances/:id/respond", () => {
  it("records ACKNOWLEDGED with a response timestamp", async () => {
    const a = await acceptance(rec.id);
    const res = await agent.post(`/recycler/acceptances/${a.id}/respond`).send({ response: "ACKNOWLEDGED" });
    expect(res.status).toBe(200);
    expect(res.body.acceptance.recyclerResponse).toBe("ACKNOWLEDGED");
    expect(res.body.acceptance.responseTs).not.toBeNull();
  });

  it("records DECLINED without deleting anything — a decline is evidence", async () => {
    const a = await acceptance(rec.id);
    await agent.post(`/recycler/acceptances/${a.id}/respond`).send({ response: "DECLINED" });
    const stored = await prisma.acceptance.findUnique({ where: { id: a.id } });
    expect(stored.recyclerResponse).toBe("DECLINED");
    expect(await prisma.acceptance.count()).toBe(1);
  });

  it("refuses a response value outside the vocabulary", async () => {
    const a = await acceptance(rec.id);
    const res = await agent.post(`/recycler/acceptances/${a.id}/respond`).send({ response: "MAYBE" });
    expect(res.status).toBe(400);
  });

  it("404s on another facility's acceptance rather than 403 — do not confirm it exists", async () => {
    const a = await acceptance(other.id);
    const res = await agent.post(`/recycler/acceptances/${a.id}/respond`).send({ response: "DECLINED" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run server/api/test/recycler-acceptances.test.js
```

Expected: FAIL — 404 on both routes.

- [ ] **Step 3: Append to `server/api/src/routes/recycler.js`**

```js
import { RECYCLER_RESPONSES } from "@bhaav/core/constants";

recyclerRouter.get("/acceptances", async (req, res, next) => {
  try {
    const rows = await prisma.acceptance.findMany({
      where: { recyclerId: req.recyclerId },
      orderBy: { acceptedTs: "desc" },
      include: { lot: { include: { category: true } } },
    });

    res.json({
      // FRONTEND.md R2: the console must say this out loud, so a recycler does
      // not think inaction cancels anything. The API states it rather than
      // leaving the UI to invent the wording.
      inactionMeans: "collector_arrives_as_planned",
      acceptances: rows.map((a) => ({
        id: a.id,
        lotId: a.lotId,
        // Pseudonymous uuid. There is no name, no phone and no Aadhaar to leak,
        // because DB.md 3.1 has nowhere to put them.
        collectorId: a.lot.collectorId,
        categoryCode: a.lot.category.code,
        categoryNameEn: a.lot.category.nameEn,
        quantity: Number(a.lot.quantity),
        unit: a.lot.unit,
        condition: a.lot.condition,
        estimatedValue: Number(a.lot.estimatedValue),
        acceptedRate: Number(a.acceptedRate),
        acceptedUnit: a.acceptedUnit,
        acceptedTs: a.acceptedTs.toISOString(),
        collectionLat: a.lot.collectionLat,
        collectionLng: a.lot.collectionLng,
        recyclerResponse: a.recyclerResponse,
        responseTs: a.responseTs?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

recyclerRouter.post("/acceptances/:id/respond", async (req, res, next) => {
  try {
    const { response } = req.body ?? {};
    if (!RECYCLER_RESPONSES.includes(response) || response === "NONE") {
      return res.status(400).json({
        error: "bad_request",
        detail: "response must be ACKNOWLEDGED or DECLINED",
      });
    }

    // Scoped by recyclerId in the same query: another facility's acceptance is
    // indistinguishable from one that does not exist.
    const updated = await prisma.acceptance.updateMany({
      where: { id: req.params.id, recyclerId: req.recyclerId },
      data: { recyclerResponse: response, responseTs: new Date() },
    });
    if (updated.count === 0) return res.status(404).json({ error: "not_found" });

    const row = await prisma.acceptance.findUnique({ where: { id: req.params.id } });
    res.json({
      acceptance: {
        id: row.id,
        recyclerResponse: row.recyclerResponse,
        responseTs: row.responseTs.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/recycler-acceptances.test.js
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add server/api/src/routes/recycler.js server/api/test/recycler-acceptances.test.js
git commit -m "feat(api): incoming acceptances and the acknowledge/decline action

A decline is stored, never deleted: a recycler who publishes an attractive
rate and declines everything is a gaming pattern you can only see if the
declines survive."
```

---

## Task 15: `GET /lots/:reference_code` — the QR lookup

**Files:**
- Create: `server/api/src/routes/lots.js`
- Modify: `server/api/src/app.js`
- Test: `server/api/test/lots-lookup.test.js`

**Interfaces:**
- Produces: `GET /lots/:reference_code -> { lot, acceptance, photos[], handover|null }`

The reference code is derived on the device from the lot UUID (`referenceCodeFromUuid`), so it exists before the record has ever reached a server. The console can therefore scan a QR from a phone that has never been online.

- [ ] **Step 1: Write the failing test**

`server/api/test/lots-lookup.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";

const app = createApp();
let rec;
let cat;
let col;
let lot;
let agent;

beforeEach(async () => {
  await truncateAll();
  rec = await makeRecycler();
  cat = await makeCategory();
  col = await makeCollector();
  lot = await makeLot({ collectorId: col.id, categoryId: cat.id, status: "ACCEPTED" });
  await prisma.acceptance.create({
    data: {
      id: uuidv7(),
      lotId: lot.id,
      recyclerId: rec.id,
      acceptedRate: "420.00",
      acceptedUnit: "KG",
      acceptedTs: new Date("2026-09-02T10:15:00+05:30"),
    },
  });
  await prisma.recyclerAccount.create({
    data: { recyclerId: rec.id, email: "r@bhaav.demo", passwordHash: await hashPassword("pw") },
  });
  agent = request.agent(app);
  await agent.post("/auth/login").send({ email: "r@bhaav.demo", password: "pw" });
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("GET /lots/:reference_code", () => {
  it("finds the lot by the code derived from its uuid", async () => {
    const res = await agent.get(`/lots/${referenceCodeFromUuid(lot.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.lot.id).toBe(lot.id);
    expect(res.body.lot.categoryCode).toBe("PCB");
    expect(res.body.lot.quantity).toBe(3);
    expect(res.body.lot.condition).toBe("GOOD");
  });

  it("returns the frozen accepted rate — the second of the three prices", async () => {
    const res = await agent.get(`/lots/${referenceCodeFromUuid(lot.id)}`);
    expect(res.body.acceptance.acceptedRate).toBe(420);
  });

  it("accepts a lowercase code — a recycler may type it", async () => {
    const res = await agent.get(`/lots/${referenceCodeFromUuid(lot.id).toLowerCase()}`);
    expect(res.status).toBe(200);
  });

  it("404s on an unknown code", async () => {
    expect((await agent.get("/lots/ZZZZZZZZ")).status).toBe(404);
  });

  it("400s on a code that is not 8 Crockford Base32 characters", async () => {
    expect((await agent.get("/lots/nope")).status).toBe(400);
  });

  it("returns the existing handover when there is one, so a second scan is idempotent", async () => {
    await makeHandover({ lotId: lot.id, recyclerId: rec.id });
    const res = await agent.get(`/lots/${referenceCodeFromUuid(lot.id)}`);
    expect(res.body.handover.status).toBe("PENDING_COLLECTOR");
    expect(res.body.handover.finalTotal).toBe(1131);
  });

  it("returns null handover when the lot has not been handed over", async () => {
    const res = await agent.get(`/lots/${referenceCodeFromUuid(lot.id)}`);
    expect(res.body.handover).toBeNull();
  });

  it("401s without a session", async () => {
    expect((await request(app).get(`/lots/${referenceCodeFromUuid(lot.id)}`)).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run server/api/test/lots-lookup.test.js
```

Expected: FAIL — 404.

- [ ] **Step 3: Write `server/api/src/routes/lots.js`**

```js
import { Router } from "express";
import { prisma } from "../db.js";
import { referenceCodeFromUuid } from "@bhaav/core/ids";
import { requireRecycler } from "../middleware/session.js";

export const lotsRouter = Router();
lotsRouter.use(requireRecycler);

const REF_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

/**
 * The reference code is a pure function of the lot uuid, so the lookup is a
 * scan of candidate lots rather than an index hit. At hackathon volume that is
 * free; at scale the code would be stored as a generated column on `lot`.
 *
 * `handover.reference_code` is already indexed, so a lot that has been handed
 * over is found directly and only the pre-handover case scans.
 */
export async function findLotByReference(code) {
  const viaHandover = await prisma.handover.findUnique({
    where: { referenceCode: code },
    select: { lotId: true },
  });
  if (viaHandover) return viaHandover.lotId;

  const candidates = await prisma.lot.findMany({
    where: { status: { in: ["DRAFT", "ACCEPTED"] } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  return candidates.find((l) => referenceCodeFromUuid(l.id) === code)?.id ?? null;
}

lotsRouter.get("/:reference_code", async (req, res, next) => {
  try {
    const code = String(req.params.reference_code).toUpperCase();
    if (!REF_RE.test(code)) {
      return res
        .status(400)
        .json({ error: "bad_request", detail: "reference code must be 8 Crockford Base32 characters" });
    }

    const lotId = await findLotByReference(code);
    if (!lotId) return res.status(404).json({ error: "not_found" });

    const lot = await prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        category: true,
        photos: true,
        handover: true,
        acceptances: { orderBy: { acceptedTs: "desc" }, take: 1, include: { recycler: true } },
      },
    });

    const acc = lot.acceptances[0] ?? null;
    res.json({
      referenceCode: code,
      lot: {
        id: lot.id,
        collectorId: lot.collectorId,
        categoryCode: lot.category.code,
        categoryNameEn: lot.category.nameEn,
        categoryNameMr: lot.category.nameMr,
        unit: lot.unit,
        quantity: Number(lot.quantity),
        condition: lot.condition,
        sourceType: lot.sourceType,
        estimatedValue: Number(lot.estimatedValue),
        collectionLat: lot.collectionLat,
        collectionLng: lot.collectionLng,
        collectionTs: lot.collectionTs.toISOString(),
        status: lot.status,
      },
      acceptance: acc
        ? {
            id: acc.id,
            recyclerId: acc.recyclerId,
            recyclerName: acc.recycler.name,
            acceptedRate: Number(acc.acceptedRate),
            acceptedUnit: acc.acceptedUnit,
            acceptedTs: acc.acceptedTs.toISOString(),
            recyclerResponse: acc.recyclerResponse,
          }
        : null,
      photos: lot.photos.map((p) => ({
        id: p.id,
        kind: p.kind,
        sha256: p.sha256,
        bytes: p.bytes,
        uploaded: p.uploadedAt !== null,
        url: p.uploadedAt ? `/photos/${p.id}` : null,
      })),
      handover: lot.handover
        ? {
            id: lot.handover.id,
            referenceCode: lot.handover.referenceCode,
            inspectedQuantity: Number(lot.handover.inspectedQuantity),
            finalUnitPrice: Number(lot.handover.finalUnitPrice),
            finalTotal: Number(lot.handover.finalTotal),
            inspectedCondition: lot.handover.inspectedCondition,
            downgradeReasonCode: lot.handover.downgradeReasonCode,
            collectorProtest: lot.handover.collectorProtest,
            status: lot.handover.status,
            handoverTs: lot.handover.handoverTs.toISOString(),
            recyclerConfirmedAt: lot.handover.recyclerConfirmedAt?.toISOString() ?? null,
            collectorConfirmedAt: lot.handover.collectorConfirmedAt?.toISOString() ?? null,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Mount it**

```js
import { lotsRouter } from "./routes/lots.js";
```

```js
  app.use("/lots", lotsRouter);
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/lots-lookup.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add server/api/src/routes/lots.js server/api/src/app.js server/api/test/lots-lookup.test.js
git commit -m "feat(api): QR lookup by device-derived reference code"
```

---

## Task 16: `POST /handover` — the recycler submits

**Files:**
- Modify: `server/api/src/routes/lots.js`
- Modify: `server/api/src/app.js`
- Test: `server/api/test/handover-submit.test.js`

**Interfaces:**
- Produces: `POST /handover { lotId, inspectedQuantity, finalUnitPrice, inspectedCondition?, downgradeReasonCode? } -> { handover }`

Two rules that are not negotiable here. **A downgrade requires a reason code** — `AI-ANOMALY-SPEC` §3.1 puts the friction on the recycler, never on the collector, and §3.2 says the reason is picked from a fixed list, never typed. And **the record lands at `PENDING_COLLECTOR`, never `CONFIRMED`** — only task 17 can close it.

- [ ] **Step 1: Write the failing test**

`server/api/test/handover-submit.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
} from "./helpers/db.js";

const app = createApp();
let rec;
let cat;
let col;
let lot;
let agent;

const body = (over = {}) => ({
  lotId: lot.id,
  inspectedQuantity: 2.9,
  finalUnitPrice: 400,
  handoverLat: 19.4213,
  handoverLng: 72.8449,
  handoverTs: "2026-09-02T12:40:00+05:30",
  ...over,
});

beforeEach(async () => {
  await truncateAll();
  rec = await makeRecycler();
  cat = await makeCategory();
  col = await makeCollector();
  lot = await makeLot({ collectorId: col.id, categoryId: cat.id, status: "ACCEPTED" });
  await prisma.acceptance.create({
    data: {
      id: uuidv7(),
      lotId: lot.id,
      recyclerId: rec.id,
      acceptedRate: "420.00",
      acceptedUnit: "KG",
      acceptedTs: new Date("2026-09-02T10:15:00+05:30"),
    },
  });
  await prisma.recyclerAccount.create({
    data: { recyclerId: rec.id, email: "r@bhaav.demo", passwordHash: await hashPassword("pw") },
  });
  agent = request.agent(app);
  await agent.post("/auth/login").send({ email: "r@bhaav.demo", password: "pw" });
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("POST /handover", () => {
  it("creates the record at PENDING_COLLECTOR with the recycler's signature only", async () => {
    const res = await agent.post("/handover").send(body());
    expect(res.status).toBe(201);
    expect(res.body.handover.status).toBe("PENDING_COLLECTOR");
    expect(res.body.handover.recyclerConfirmedAt).not.toBeNull();
    expect(res.body.handover.collectorConfirmedAt).toBeNull();
  });

  it("computes final_total server-side from quantity and unit price", async () => {
    const res = await agent.post("/handover").send(body());
    expect(res.body.handover.finalTotal).toBe(1160);
  });

  it("ignores a final_total supplied by the client", async () => {
    const res = await agent.post("/handover").send(body({ finalTotal: 1 }));
    expect(res.body.handover.finalTotal).toBe(1160);
  });

  it("derives the reference code from the lot uuid so it matches the QR", async () => {
    const res = await agent.post("/handover").send(body());
    expect(res.body.handover.referenceCode).toBe(referenceCodeFromUuid(lot.id));
  });

  it("moves the lot to HANDED_OVER", async () => {
    await agent.post("/handover").send(body());
    expect((await prisma.lot.findUnique({ where: { id: lot.id } })).status).toBe("HANDED_OVER");
  });

  it("refuses a downgrade with no reason code", async () => {
    const res = await agent.post("/handover").send(body({ inspectedCondition: "POOR" }));
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/downgrade_reason_code is required/i);
  });

  it("accepts a downgrade with a reason code from the fixed list", async () => {
    const res = await agent
      .post("/handover")
      .send(body({ inspectedCondition: "POOR", downgradeReasonCode: "POOR_CONDITION" }));
    expect(res.status).toBe(201);
    expect(res.body.handover.downgradeReasonCode).toBe("POOR_CONDITION");
  });

  it("does not require a reason when the grade is unchanged or better", async () => {
    const res = await agent.post("/handover").send(body({ inspectedCondition: "GOOD" }));
    expect(res.status).toBe(201);
    expect(res.body.handover.downgradeReasonCode).toBeNull();
  });

  it("returns a validation prompt, not a flag, on a 10x price fat-finger", async () => {
    const res = await agent.post("/handover").send(body({ finalUnitPrice: 4200 }));
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("value_check");
    expect(res.body.suggestion).toBe(420);
    expect(await prisma.handover.count()).toBe(0);
  });

  it("accepts the same fat-fingered value once confirmed", async () => {
    const res = await agent.post("/handover").send(body({ finalUnitPrice: 4200, confirmValue: true }));
    expect(res.status).toBe(201);
  });

  it("refuses a second handover for the same lot", async () => {
    await agent.post("/handover").send(body());
    const res = await agent.post("/handover").send(body());
    expect(res.status).toBe(409);
  });

  it("refuses a lot that never accepted this facility", async () => {
    const other = await makeRecycler({ name: "Theirs" });
    await prisma.recyclerAccount.create({
      data: { recyclerId: other.id, email: "o@bhaav.demo", passwordHash: await hashPassword("pw") },
    });
    const otherAgent = request.agent(app);
    await otherAgent.post("/auth/login").send({ email: "o@bhaav.demo", password: "pw" });
    const res = await otherAgent.post("/handover").send(body());
    expect(res.status).toBe(403);
  });

  it("cannot be set to CONFIRMED from this endpoint", async () => {
    const res = await agent.post("/handover").send(body({ status: "CONFIRMED" }));
    expect(res.body.handover.status).toBe("PENDING_COLLECTOR");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run server/api/test/handover-submit.test.js
```

Expected: FAIL — 404.

- [ ] **Step 3: Append to `server/api/src/routes/lots.js`**

```js
import { Router as makeRouter } from "express";
import { uuidv7 } from "@bhaav/core/ids";
import { CONDITIONS, DOWNGRADE_REASON_CODES } from "@bhaav/core/constants";
import { round2 } from "@bhaav/core/pricing";

export const handoverSubmitRouter = makeRouter();
handoverSubmitRouter.use(requireRecycler);

const GRADE = { GOOD: 3, FAIR: 2, POOR: 1 };

handoverSubmitRouter.post("/", async (req, res, next) => {
  try {
    const {
      lotId,
      inspectedQuantity,
      finalUnitPrice,
      inspectedCondition = null,
      downgradeReasonCode = null,
      collectorProtest = false,
      handoverLat = null,
      handoverLng = null,
      handoverTs,
      confirmValue = false,
    } = req.body ?? {};

    const lot = await prisma.lot.findUnique({
      where: { id: String(lotId ?? "") },
      include: { acceptances: true, handover: true },
    });
    if (!lot) return res.status(404).json({ error: "not_found" });
    if (lot.handover) return res.status(409).json({ error: "already_handed_over" });

    const acceptance = lot.acceptances.find((a) => a.recyclerId === req.recyclerId);
    if (!acceptance) {
      return res.status(403).json({ error: "forbidden", detail: "this lot did not accept your rate" });
    }

    const qty = Number(inspectedQuantity);
    const price = Number(finalUnitPrice);
    if (!(qty > 0)) {
      return res.status(400).json({ error: "bad_request", detail: "inspectedQuantity must be greater than zero" });
    }
    if (!(price >= 0)) {
      return res.status(400).json({ error: "bad_request", detail: "finalUnitPrice must be zero or greater" });
    }

    if (inspectedCondition !== null && !CONDITIONS.includes(inspectedCondition)) {
      return res.status(400).json({ error: "bad_request", detail: "inspectedCondition must be GOOD, FAIR or POOR" });
    }

    // AI-ANOMALY-SPEC 3.1: the friction goes on the recycler. A downgrade is
    // only accepted with a reason picked from the fixed list in 3.2 — never
    // free text, because a fixed list can be counted and prose cannot.
    const isDowngrade =
      inspectedCondition !== null && GRADE[inspectedCondition] < GRADE[lot.condition];
    if (isDowngrade && !DOWNGRADE_REASON_CODES.includes(downgradeReasonCode)) {
      return res.status(400).json({
        error: "bad_request",
        detail: `downgrade_reason_code is required when the inspected grade is below the declared grade, and must be one of ${DOWNGRADE_REASON_CODES.join(", ")}`,
      });
    }

    // AI-ANOMALY-SPEC gap 7: a data-entry error is not an anomaly. This is the
    // ONE place a block is correct, and it is a validation prompt, not an
    // accusation. The recycler re-enters or confirms.
    const published = Number(acceptance.acceptedRate);
    if (!confirmValue && published > 0 && (price > published * 5 || price < published * 0.2)) {
      return res.status(422).json({
        error: "value_check",
        detail: `entered ${price} against a published rate of ${published}`,
        suggestion: published,
        resend: "set confirmValue: true to record this value as entered",
      });
    }

    const id = uuidv7();
    const handover = await prisma.$transaction(async (tx) => {
      const created = await tx.handover.create({
        data: {
          id,
          lotId: lot.id,
          recyclerId: req.recyclerId,
          referenceCode: referenceCodeFromUuid(lot.id),
          inspectedQuantity: qty.toFixed(3),
          finalUnitPrice: price.toFixed(2),
          // Never trust a client-supplied total. The three prices are only
          // auditable if each one is derived where it is authoritative.
          finalTotal: round2(qty * price).toFixed(2),
          inspectedCondition,
          downgradeReasonCode: isDowngrade ? downgradeReasonCode : null,
          collectorProtest: Boolean(collectorProtest),
          handoverLat,
          handoverLng,
          handoverTs: handoverTs ? new Date(handoverTs) : new Date(),
          // Always PENDING_COLLECTOR. Only /handover/:lot_id/confirm may close
          // the record, and the database CHECK backs that up.
          status: "PENDING_COLLECTOR",
          recyclerConfirmedAt: new Date(),
        },
      });
      await tx.lot.update({ where: { id: lot.id }, data: { status: "HANDED_OVER" } });
      return created;
    });

    res.status(201).json({
      handover: {
        id: handover.id,
        lotId: handover.lotId,
        referenceCode: handover.referenceCode,
        inspectedQuantity: Number(handover.inspectedQuantity),
        finalUnitPrice: Number(handover.finalUnitPrice),
        finalTotal: Number(handover.finalTotal),
        inspectedCondition: handover.inspectedCondition,
        downgradeReasonCode: handover.downgradeReasonCode,
        collectorProtest: handover.collectorProtest,
        status: handover.status,
        handoverTs: handover.handoverTs.toISOString(),
        recyclerConfirmedAt: handover.recyclerConfirmedAt.toISOString(),
        collectorConfirmedAt: null,
      },
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Mount it**

```js
import { lotsRouter, handoverSubmitRouter } from "./routes/lots.js";
```

```js
  app.use("/handover", handoverSubmitRouter);
```

Mount `/handover` **before** `/lots` so the paths do not shadow each other.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/handover-submit.test.js
```

Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add server/api/src/routes/lots.js server/api/src/app.js server/api/test/handover-submit.test.js
git commit -m "feat(api): recycler submits a handover — reason code required for any downgrade

The 5x/0.2x value check is a validation prompt, not an anomaly flag. It is the
one place a block is correct (AI-ANOMALY-SPEC gap 7)."
```

---

## Task 17: `POST /handover/:lot_id/confirm` — the collector's signature

**Never cut this task.** It is the two-sided signature, one of the two things being demonstrated.

**Files:**
- Create: `server/api/src/routes/handover.js`
- Modify: `server/api/src/app.js`
- Test: `server/api/test/handover-confirm.test.js`

**Interfaces:**
- Produces: `POST /handover/:lot_id/confirm { collectorId, agree, protest?, confirmedAt? } -> { handover }`

No session is required: the collector app has no credential. The `collectorId` in the body must match `lot.collector_id`, which is the only claim the device can make and the only one it needs.

- [ ] **Step 1: Write the failing test**

`server/api/test/handover-confirm.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7 } from "@bhaav/core/ids";
import { createApp } from "../src/app.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";

const app = createApp();
let rec;
let cat;
let col;
let lot;

beforeEach(async () => {
  await truncateAll();
  rec = await makeRecycler();
  cat = await makeCategory();
  col = await makeCollector();
  lot = await makeLot({ collectorId: col.id, categoryId: cat.id, status: "HANDED_OVER" });
  await makeHandover({
    lotId: lot.id,
    recyclerId: rec.id,
    recyclerConfirmedAt: new Date("2026-09-02T12:40:00+05:30"),
    status: "PENDING_COLLECTOR",
  });
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

const confirm = (body) => request(app).post(`/handover/${lot.id}/confirm`).send(body);

describe("POST /handover/:lot_id/confirm", () => {
  it("closes the record when the collector agrees", async () => {
    const res = await confirm({ collectorId: col.id, agree: true });
    expect(res.status).toBe(200);
    expect(res.body.handover.status).toBe("CONFIRMED");
    expect(res.body.handover.collectorConfirmedAt).not.toBeNull();
  });

  it("marks it DISPUTED when the collector says the amount is wrong", async () => {
    const res = await confirm({ collectorId: col.id, agree: false });
    expect(res.body.handover.status).toBe("DISPUTED");
    // A dispute still records the collector's signature — they were present
    // and they responded. The status is what carries the disagreement.
    expect(res.body.handover.collectorConfirmedAt).not.toBeNull();
  });

  it("records protest separately from confirmation — a signature is not agreement", async () => {
    const res = await confirm({ collectorId: col.id, agree: true, protest: true });
    expect(res.body.handover.status).toBe("CONFIRMED");
    expect(res.body.handover.collectorProtest).toBe(true);
  });

  it("is idempotent — replaying the outbox does not move a closed record", async () => {
    const first = await confirm({ collectorId: col.id, agree: true });
    const second = await confirm({ collectorId: col.id, agree: false });
    expect(second.status).toBe(200);
    expect(second.body.handover.status).toBe("CONFIRMED");
    expect(second.body.handover.collectorConfirmedAt).toBe(
      first.body.handover.collectorConfirmedAt,
    );
  });

  it("refuses a collectorId that does not own the lot", async () => {
    const stranger = await makeCollector();
    const res = await confirm({ collectorId: stranger.id, agree: true });
    expect(res.status).toBe(403);
    const stored = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(stored.status).toBe("PENDING_COLLECTOR");
  });

  it("404s when no handover exists for the lot", async () => {
    const orphan = await makeLot({ collectorId: col.id, categoryId: cat.id });
    const res = await request(app)
      .post(`/handover/${orphan.id}/confirm`)
      .send({ collectorId: col.id, agree: true });
    expect(res.status).toBe(404);
  });

  it("refuses to confirm before the recycler has signed", async () => {
    const otherLot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    await makeHandover({
      lotId: otherLot.id,
      recyclerId: rec.id,
      referenceCode: "AAAAAAAA",
      recyclerConfirmedAt: null,
    });
    const res = await request(app)
      .post(`/handover/${otherLot.id}/confirm`)
      .send({ collectorId: col.id, agree: true });
    expect(res.status).toBe(409);
  });

  it("accepts a device-supplied confirmedAt so an offline confirmation keeps its real time", async () => {
    const at = "2026-09-02T12:45:00+05:30";
    const res = await confirm({ collectorId: col.id, agree: true, confirmedAt: at });
    expect(new Date(res.body.handover.collectorConfirmedAt).toISOString()).toBe(
      new Date(at).toISOString(),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run server/api/test/handover-confirm.test.js
```

Expected: FAIL — 404.

- [ ] **Step 3: Write `server/api/src/routes/handover.js`**

```js
import { Router } from "express";
import { prisma } from "../db.js";

export const handoverConfirmRouter = Router();

/**
 * The collector's side of the two-sided confirmation.
 *
 * No session, no password, no OTP. The collector app has no credential by
 * design (SERVER.md section 5), so the only claim the device makes is the
 * collector uuid it generated, and it must match the lot it is confirming.
 *
 * A confirmation may arrive days after the fact, from an outbox that has been
 * offline. `confirmedAt` is therefore taken from the device when supplied:
 * the record must carry when the collector actually agreed, not when the
 * network happened to come back.
 */
handoverConfirmRouter.post("/:lot_id/confirm", async (req, res, next) => {
  try {
    const { collectorId, agree, protest = false, confirmedAt } = req.body ?? {};

    const lot = await prisma.lot.findUnique({
      where: { id: String(req.params.lot_id) },
      include: { handover: true },
    });
    if (!lot || !lot.handover) return res.status(404).json({ error: "not_found" });
    if (lot.collectorId !== collectorId) {
      return res.status(403).json({ error: "forbidden", detail: "collector does not own this lot" });
    }
    if (!lot.handover.recyclerConfirmedAt) {
      return res.status(409).json({
        error: "conflict",
        detail: "the recycler has not signed yet",
      });
    }

    // Already closed. Replaying the outbox must never move a closed record —
    // it is an event log, not mutable state (SERVER.md section 2.4).
    if (lot.handover.collectorConfirmedAt) {
      return res.json({ handover: shape(lot.handover) });
    }

    const at = confirmedAt ? new Date(confirmedAt) : new Date();
    const updated = await prisma.handover.update({
      where: { id: lot.handover.id },
      data: {
        collectorConfirmedAt: at,
        // A DISPUTED record still carries the collector's signature: they were
        // present and they responded. The status is what carries the
        // disagreement, and the CHECK only gates CONFIRMED.
        status: agree ? "CONFIRMED" : "DISPUTED",
        collectorProtest: Boolean(protest) || lot.handover.collectorProtest,
      },
    });

    res.json({ handover: shape(updated) });
  } catch (err) {
    next(err);
  }
});

function shape(h) {
  return {
    id: h.id,
    lotId: h.lotId,
    referenceCode: h.referenceCode,
    inspectedQuantity: Number(h.inspectedQuantity),
    finalUnitPrice: Number(h.finalUnitPrice),
    finalTotal: Number(h.finalTotal),
    inspectedCondition: h.inspectedCondition,
    downgradeReasonCode: h.downgradeReasonCode,
    collectorProtest: h.collectorProtest,
    status: h.status,
    handoverTs: h.handoverTs.toISOString(),
    recyclerConfirmedAt: h.recyclerConfirmedAt?.toISOString() ?? null,
    collectorConfirmedAt: h.collectorConfirmedAt?.toISOString() ?? null,
  };
}
```

- [ ] **Step 4: Mount it before `handoverSubmitRouter`**

```js
import { handoverConfirmRouter } from "./routes/handover.js";
```

```js
  app.use("/handover", handoverConfirmRouter);
  app.use("/handover", handoverSubmitRouter);
```

The confirm router matches `/:lot_id/confirm`; the submit router matches `/`. Order them this way so a lot id is never read as the submit path.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/handover-confirm.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Prove the constraint is doing the work, not the handler**

```bash
psql -d bhaav_test -c "INSERT INTO handover (id, lot_id, recycler_id, reference_code, inspected_quantity, final_unit_price, final_total, handover_ts, status) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'TESTTEST', 1, 1, 1, now(), 'CONFIRMED');"
```

Expected: an error naming either the foreign key or `handover_confirmed_needs_both_signatures`. If it succeeds, the raw migration did not reach `bhaav_test` — go back to task 6 step 6.

- [ ] **Step 7: Commit**

```bash
git add server/api/src/routes/handover.js server/api/src/app.js server/api/test/handover-confirm.test.js
git commit -m "feat(api): collector confirmation closes the two-sided record

Never cut this. The recycler cannot record an amount the collector did not
agree to, and the database enforces it."
```

---

## Task 18: `POST /photos` — deferred multipart upload

**Files:**
- Create: `server/api/src/routes/photos.js`
- Modify: `server/api/src/app.js`
- Test: `server/api/test/photos.test.js`

**Interfaces:**
- Produces: `POST /photos` (multipart: `file`, `photoId`, `lotId`, `kind`, `sha256`) `-> { photo }`; `GET /photos/:id` serving the bytes

`uploaded_at` being `NULL` is normal, not an error: a record is valid before its photograph has synced (`DB.md` §3.8).

- [ ] **Step 1: Write the failing test**

`server/api/test/photos.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import request from "supertest";
import { uuidv7 } from "@bhaav/core/ids";
import { createApp } from "../src/app.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
} from "./helpers/db.js";

const app = createApp();
const DIR = "./server/api/test/tmp-uploads";
process.env.PHOTO_DIR = DIR;

const BYTES = Buffer.from("fake-jpeg-bytes-for-the-test");
const SHA = createHash("sha256").update(BYTES).digest("hex");

let lot;
let cat;
let col;

beforeEach(async () => {
  await truncateAll();
  cat = await makeCategory();
  col = await makeCollector();
  await makeRecycler();
  lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
});
afterAll(async () => {
  await truncateAll();
  await rm(DIR, { recursive: true, force: true });
  await prisma.$disconnect();
});

const upload = (fields = {}) => {
  const req = request(app).post("/photos").attach("file", BYTES, "lot.jpg");
  const all = { photoId: uuidv7(), lotId: lot.id, kind: "LOT", sha256: SHA, ...fields };
  for (const [k, v] of Object.entries(all)) req.field(k, String(v));
  return req;
};

describe("POST /photos", () => {
  it("stores the file and stamps uploaded_at", async () => {
    const res = await upload();
    expect(res.status).toBe(201);
    expect(res.body.photo.uploaded).toBe(true);
    const row = await prisma.photo.findFirst();
    expect(row.uploadedAt).not.toBeNull();
    expect(row.bytes).toBe(BYTES.length);
  });

  it("rejects a payload whose sha256 does not match the bytes", async () => {
    const res = await upload({ sha256: "0".repeat(64) });
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/sha256/i);
    expect(await prisma.photo.count()).toBe(0);
  });

  it("is idempotent — re-uploading the same photoId does not duplicate the row", async () => {
    const photoId = uuidv7();
    await upload({ photoId });
    await upload({ photoId });
    expect(await prisma.photo.count()).toBe(1);
  });

  it("rejects an unknown lot", async () => {
    const res = await upload({ lotId: uuidv7() });
    expect(res.status).toBe(404);
  });

  it("rejects a kind outside LOT and HANDOVER", async () => {
    expect((await upload({ kind: "SELFIE" })).status).toBe(400);
  });

  it("serves the bytes back", async () => {
    const photoId = uuidv7();
    await upload({ photoId });
    const res = await request(app).get(`/photos/${photoId}`);
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body)).toEqual(BYTES);
  });

  it("404s on a photo id that was never uploaded", async () => {
    expect((await request(app).get(`/photos/${uuidv7()}`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run server/api/test/photos.test.js
```

Expected: FAIL — 404.

- [ ] **Step 3: Write `server/api/src/routes/photos.js`**

```js
import { Router } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prisma } from "../db.js";

export const photosRouter = Router();

// In memory: photos are compressed to roughly 200 KB on the device
// (FRONTEND.md S1), and holding one in RAM to verify its digest before it
// touches disk is simpler than cleaning up a rejected temp file.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const dir = () => resolve(process.env.PHOTO_DIR ?? "./server/api/uploads");

photosRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const { photoId, lotId, kind, sha256 } = req.body ?? {};
    if (!req.file) return res.status(400).json({ error: "bad_request", detail: "file is required" });
    if (!["LOT", "HANDOVER"].includes(kind)) {
      return res.status(400).json({ error: "bad_request", detail: "kind must be LOT or HANDOVER" });
    }

    const lot = await prisma.lot.findUnique({ where: { id: String(lotId ?? "") }, select: { id: true } });
    if (!lot) return res.status(404).json({ error: "not_found", detail: "unknown lot" });

    // sha256 gives integrity and free duplicate detection: the same photograph
    // reused across two lots is a fabrication signal (DB.md 3.8), and D14 later
    // builds on exactly this.
    const actual = createHash("sha256").update(req.file.buffer).digest("hex");
    if (actual !== String(sha256).toLowerCase()) {
      return res.status(400).json({
        error: "bad_request",
        detail: `sha256 mismatch: declared ${sha256}, received ${actual}`,
      });
    }

    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), `${photoId}.bin`), req.file.buffer);

    const photo = await prisma.photo.upsert({
      where: { id: String(photoId) },
      update: { uploadedAt: new Date() },
      create: {
        id: String(photoId),
        lotId: lot.id,
        kind,
        sha256: actual,
        bytes: req.file.size,
        uploadedAt: new Date(),
      },
    });

    res.status(201).json({
      photo: {
        id: photo.id,
        lotId: photo.lotId,
        kind: photo.kind,
        sha256: photo.sha256,
        bytes: photo.bytes,
        uploaded: photo.uploadedAt !== null,
        url: `/photos/${photo.id}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

photosRouter.get("/:id", async (req, res, next) => {
  try {
    const photo = await prisma.photo.findUnique({ where: { id: String(req.params.id) } });
    if (!photo || !photo.uploadedAt) return res.status(404).json({ error: "not_found" });
    const bytes = await readFile(join(dir(), `${photo.id}.bin`));
    res.type("image/jpeg").send(bytes);
  } catch (err) {
    if (err.code === "ENOENT") return res.status(404).json({ error: "not_found" });
    next(err);
  }
});
```

- [ ] **Step 4: Mount it**

```js
import { photosRouter } from "./routes/photos.js";
```

```js
  app.use("/photos", photosRouter);
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/photos.test.js
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add server/api/src/routes/photos.js server/api/src/app.js server/api/test/photos.test.js
git commit -m "feat(api): deferred photo upload with sha256 verification"
```

---

## Task 19: `GET /recycler/history` — the three prices and the CSV export

**Files:**
- Modify: `server/api/src/routes/recycler.js`
- Test: `server/api/test/recycler-history.test.js`

**Interfaces:**
- Produces: `GET /recycler/history?from=&to=&format=csv -> { handovers[], summary }` or `text/csv`

`FRONTEND.md` R4 requires each row to show all three prices. The `summary` block implements `AI-ANOMALY-SPEC` §7.1 — **rank by what they actually paid, not what they published**. That is arithmetic over the recycler's own two-signature records: no accusation, no detector output, no legal exposure, and it destroys the whole attack because the attack's only asset is a headline number that now means nothing.

- [ ] **Step 1: Write the failing test**

`server/api/test/recycler-history.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7 } from "@bhaav/core/ids";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";

const app = createApp();
let rec;
let cat;
let col;
let agent;

async function closedHandover({ acceptedRate, finalUnitPrice, ts, downgrade = null }) {
  const lot = await makeLot({
    collectorId: col.id,
    categoryId: cat.id,
    status: "HANDED_OVER",
    collectionTs: new Date(ts),
  });
  await prisma.acceptance.create({
    data: {
      id: uuidv7(),
      lotId: lot.id,
      recyclerId: rec.id,
      acceptedRate: acceptedRate.toFixed(2),
      acceptedUnit: "KG",
      acceptedTs: new Date(ts),
    },
  });
  return makeHandover({
    lotId: lot.id,
    recyclerId: rec.id,
    inspectedQuantity: "3.000",
    finalUnitPrice: finalUnitPrice.toFixed(2),
    finalTotal: (3 * finalUnitPrice).toFixed(2),
    handoverTs: new Date(ts),
    inspectedCondition: downgrade ? "POOR" : null,
    downgradeReasonCode: downgrade,
    recyclerConfirmedAt: new Date(ts),
    collectorConfirmedAt: new Date(ts),
    status: "CONFIRMED",
  });
}

beforeEach(async () => {
  await truncateAll();
  rec = await makeRecycler();
  cat = await makeCategory();
  col = await makeCollector();
  await prisma.recyclerAccount.create({
    data: { recyclerId: rec.id, email: "r@bhaav.demo", passwordHash: await hashPassword("pw") },
  });
  agent = request.agent(app);
  await agent.post("/auth/login").send({ email: "r@bhaav.demo", password: "pw" });
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("GET /recycler/history", () => {
  it("shows all three prices on every row", async () => {
    await closedHandover({ acceptedRate: 420, finalUnitPrice: 390, ts: "2026-09-02T12:00:00+05:30" });
    const row = (await agent.get("/recycler/history")).body.handovers[0];
    expect(row.estimatedValue).toBe(1260);
    expect(row.acceptedRate).toBe(420);
    expect(row.finalTotal).toBe(1170);
  });

  it("filters by date", async () => {
    await closedHandover({ acceptedRate: 420, finalUnitPrice: 390, ts: "2026-08-01T12:00:00+05:30" });
    await closedHandover({ acceptedRate: 420, finalUnitPrice: 390, ts: "2026-09-02T12:00:00+05:30" });
    const res = await agent.get("/recycler/history?from=2026-09-01&to=2026-09-30");
    expect(res.body.handovers).toHaveLength(1);
  });

  it("reports the median actually paid alongside the published rate", async () => {
    for (const p of [80, 78, 76]) {
      await closedHandover({ acceptedRate: 180, finalUnitPrice: p, ts: "2026-09-02T12:00:00+05:30" });
    }
    const s = (await agent.get("/recycler/history")).body.summary;
    expect(s.medianFinalUnitPrice).toBe(78);
    expect(s.medianAcceptedRate).toBe(180);
    expect(s.priceCutCount).toBe(3);
    expect(s.n).toBe(3);
  });

  it("counts a price cut only where the final is below the accepted rate", async () => {
    await closedHandover({ acceptedRate: 180, finalUnitPrice: 180, ts: "2026-09-02T12:00:00+05:30" });
    await closedHandover({ acceptedRate: 180, finalUnitPrice: 200, ts: "2026-09-02T12:00:00+05:30" });
    expect((await agent.get("/recycler/history")).body.summary.priceCutCount).toBe(0);
  });

  it("reports the downgrade rate, which is the number that works in a monopsony", async () => {
    await closedHandover({ acceptedRate: 180, finalUnitPrice: 80, ts: "2026-09-02T12:00:00+05:30", downgrade: "POOR_CONDITION" });
    await closedHandover({ acceptedRate: 180, finalUnitPrice: 180, ts: "2026-09-02T12:00:00+05:30" });
    expect((await agent.get("/recycler/history")).body.summary.downgradeRate).toBe(0.5);
  });

  it("exports csv with a header row", async () => {
    await closedHandover({ acceptedRate: 420, finalUnitPrice: 390, ts: "2026-09-02T12:00:00+05:30" });
    const res = await agent.get("/recycler/history?format=csv");
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    const [header, first] = res.text.trim().split("\n");
    expect(header).toBe(
      "reference_code,handover_ts,category,quantity,estimated_value,accepted_rate,final_unit_price,final_total,inspected_condition,downgrade_reason_code,collector_protest,status",
    );
    expect(first).toMatch(/,CONFIRMED$/);
  });

  it("excludes another facility's handovers", async () => {
    const other = await makeRecycler({ name: "Theirs" });
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    await makeHandover({ lotId: lot.id, recyclerId: other.id, referenceCode: "ZZZZZZZZ" });
    expect((await agent.get("/recycler/history")).body.handovers).toHaveLength(0);
  });

  it("returns a null median rather than NaN when there is no history", async () => {
    const s = (await agent.get("/recycler/history")).body.summary;
    expect(s.n).toBe(0);
    expect(s.medianFinalUnitPrice).toBeNull();
    expect(s.downgradeRate).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run server/api/test/recycler-history.test.js
```

Expected: FAIL — 404.

- [ ] **Step 3: Append to `server/api/src/routes/recycler.js`**

```js
function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

recyclerRouter.get("/history", async (req, res, next) => {
  try {
    const where = { recyclerId: req.recyclerId };
    if (req.query.from || req.query.to) {
      where.handoverTs = {};
      if (req.query.from) where.handoverTs.gte = new Date(String(req.query.from));
      if (req.query.to) where.handoverTs.lte = new Date(`${req.query.to}T23:59:59.999Z`);
    }

    const rows = await prisma.handover.findMany({
      where,
      orderBy: { handoverTs: "desc" },
      include: { lot: { include: { category: true, acceptances: true } } },
    });

    const handovers = rows.map((h) => {
      const acc = h.lot.acceptances.find((a) => a.recyclerId === req.recyclerId) ?? null;
      return {
        id: h.id,
        referenceCode: h.referenceCode,
        handoverTs: h.handoverTs.toISOString(),
        categoryCode: h.lot.category.code,
        quantity: Number(h.inspectedQuantity),
        unit: h.lot.unit,
        declaredCondition: h.lot.condition,
        inspectedCondition: h.inspectedCondition,
        downgradeReasonCode: h.downgradeReasonCode,
        collectorProtest: h.collectorProtest,
        // The three prices, side by side (DB.md section 5). Independently
        // auditable because each is written where it is authoritative.
        estimatedValue: Number(h.lot.estimatedValue),
        acceptedRate: acc ? Number(acc.acceptedRate) : null,
        finalUnitPrice: Number(h.finalUnitPrice),
        finalTotal: Number(h.finalTotal),
        status: h.status,
      };
    });

    // AI-ANOMALY-SPEC 7.1 and 7.4. This is arithmetic over the recycler's own
    // two-signature records — no accusation, no detector output, no legal
    // exposure — and it is what makes a headline published rate meaningless
    // on its own. Also the one number that still works in a single-buyer
    // district, where no comparison to another recycler is possible.
    const withRate = handovers.filter((h) => h.acceptedRate !== null);
    const graded = handovers.filter((h) => h.inspectedCondition !== null);
    const summary = {
      n: handovers.length,
      medianAcceptedRate: median(withRate.map((h) => h.acceptedRate)),
      medianFinalUnitPrice: median(handovers.map((h) => h.finalUnitPrice)),
      priceCutCount: withRate.filter((h) => h.finalUnitPrice < h.acceptedRate).length,
      priceCutRate: withRate.length
        ? withRate.filter((h) => h.finalUnitPrice < h.acceptedRate).length / withRate.length
        : null,
      downgradeRate: graded.length
        ? graded.filter(
            (h) =>
              ({ GOOD: 3, FAIR: 2, POOR: 1 })[h.inspectedCondition] <
              ({ GOOD: 3, FAIR: 2, POOR: 1 })[h.declaredCondition],
          ).length / graded.length
        : null,
      disputedCount: handovers.filter((h) => h.status === "DISPUTED").length,
      protestCount: handovers.filter((h) => h.collectorProtest).length,
    };

    if (req.query.format === "csv") {
      const header = [
        "reference_code",
        "handover_ts",
        "category",
        "quantity",
        "estimated_value",
        "accepted_rate",
        "final_unit_price",
        "final_total",
        "inspected_condition",
        "downgrade_reason_code",
        "collector_protest",
        "status",
      ];
      const lines = handovers.map((h) =>
        [
          h.referenceCode,
          h.handoverTs,
          h.categoryCode,
          h.quantity,
          h.estimatedValue,
          h.acceptedRate,
          h.finalUnitPrice,
          h.finalTotal,
          h.inspectedCondition,
          h.downgradeReasonCode,
          h.collectorProtest,
          h.status,
        ]
          .map(csvCell)
          .join(","),
      );
      res
        .type("text/csv")
        .attachment(`bhaav-history-${new Date().toISOString().slice(0, 10)}.csv`)
        .send([header.join(","), ...lines].join("\n"));
      return;
    }

    res.json({ handovers, summary });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/recycler-history.test.js
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add server/api/src/routes/recycler.js server/api/test/recycler-history.test.js
git commit -m "feat(api): handover history with the three prices, actually-paid summary, csv export"
```

---

## Task 20: Detector run — history features, the `/detect` call, fail-open

**Files:**
- Create: `server/api/src/lib/history.js`, `server/api/src/lib/aiml.js`, `server/api/src/routes/detect.js`
- Modify: `server/api/src/app.js`
- Test: `server/api/test/history.test.js`, `server/api/test/detect.test.js`

**Interfaces:**
- Consumes: `server/aiml`'s `POST /detect` (plan 04)
- Produces: `buildDetectPayload(prisma, { asOf }) -> object` matching `AI.md` §11; `callDetect(payload) -> { ok, body|reason }`; `POST /detect-run -> { runId, detectorsRun[], detectorsSkipped[], flagsWritten }`

**Three rules from `AI-ANOMALY-SPEC` §1 that this task exists to honour.** The service is stateless and has no database access, so the API computes every history feature and passes it in — the AI developer never writes a query. The call has a **2-second timeout** and **fails open**: a detector service that is down must never block a collector's sale. And the service never writes; the API decides what to persist.

- [ ] **Step 1: Write the failing history test**

`server/api/test/history.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { uuidv7 } from "@bhaav/core/ids";
import { buildDetectPayload } from "../src/lib/history.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";

beforeEach(truncateAll);
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("buildDetectPayload", () => {
  it("matches the AI.md section 11 request shape", async () => {
    const p = await buildDetectPayload(prisma, { asOf: "2026-09-02T18:00:00+05:30" });
    expect(Object.keys(p).sort()).toEqual(
      [
        "acceptances",
        "as_of",
        "categories",
        "handovers",
        "lots",
        "rates",
        "recyclers",
        "run_id",
      ].sort(),
    );
  });

  it("sends inspected_condition and downgrade_reason_code, which D9 needs", async () => {
    const cat = await makeCategory();
    const rec = await makeRecycler();
    const col = await makeCollector();
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    await makeHandover({
      lotId: lot.id,
      recyclerId: rec.id,
      inspectedCondition: "POOR",
      downgradeReasonCode: "POOR_CONDITION",
      recyclerConfirmedAt: new Date(),
      collectorConfirmedAt: new Date(),
      status: "CONFIRMED",
    });
    const p = await buildDetectPayload(prisma, { asOf: "2026-09-02T18:00:00+05:30" });
    expect(p.handovers[0].inspected_condition).toBe("POOR");
    expect(p.handovers[0].downgrade_reason_code).toBe("POOR_CONDITION");
  });

  it("sends numbers, not Decimal strings", async () => {
    const cat = await makeCategory();
    const rec = await makeRecycler();
    const col = await makeCollector();
    await makeLot({ collectorId: col.id, categoryId: cat.id });
    await prisma.rate.create({
      data: {
        recyclerId: rec.id,
        categoryId: cat.id,
        unit: "KG",
        price: "420.00",
        source: "RECYCLER_PUBLISHED",
      },
    });
    const p = await buildDetectPayload(prisma, { asOf: "2026-09-02T18:00:00+05:30" });
    expect(typeof p.lots[0].quantity).toBe("number");
    expect(typeof p.rates[0].price).toBe("number");
  });

  it("flags recyclers sharing an address, phone or email — the D9 confidence caveat", async () => {
    await makeRecycler({ name: "A", phone: "9820350406", address: "Choudhary Compound, Wakanpada" });
    await makeRecycler({ name: "B", phone: "9820350406", address: "Choudhary Compound, Wakanpada" });
    await makeRecycler({ name: "C", phone: "9999999999", address: "Elsewhere" });
    const p = await buildDetectPayload(prisma, { asOf: "2026-09-02T18:00:00+05:30" });
    const a = p.recyclers.find((r) => r.name === "A");
    const c = p.recyclers.find((r) => r.name === "C");
    expect(a.shared_identity_group).not.toBeNull();
    expect(a.shared_identity_group).toBe(p.recyclers.find((r) => r.name === "B").shared_identity_group);
    expect(c.shared_identity_group).toBeNull();
  });

  it("counts valid recyclers per district, which D13 needs to see a single-buyer market", async () => {
    await makeRecycler({ name: "Only One", district: "Buldhana" });
    await makeRecycler({ name: "P", district: "Palghar" });
    await makeRecycler({ name: "Q", district: "Palghar" });
    const p = await buildDetectPayload(prisma, { asOf: "2026-09-02T18:00:00+05:30" });
    expect(p.recyclers.find((r) => r.name === "Only One").district_valid_recycler_count).toBe(1);
    expect(p.recyclers.find((r) => r.name === "P").district_valid_recycler_count).toBe(2);
  });

  it("sends only confirmed handovers — an unsigned record is not evidence", async () => {
    const cat = await makeCategory();
    const rec = await makeRecycler();
    const col = await makeCollector();
    const a = await makeLot({ collectorId: col.id, categoryId: cat.id });
    const b = await makeLot({ collectorId: col.id, categoryId: cat.id });
    await makeHandover({ lotId: a.id, recyclerId: rec.id, status: "PENDING_COLLECTOR" });
    await makeHandover({
      lotId: b.id,
      recyclerId: rec.id,
      referenceCode: "BBBBBBBB",
      recyclerConfirmedAt: new Date(),
      collectorConfirmedAt: new Date(),
      status: "CONFIRMED",
    });
    const p = await buildDetectPayload(prisma, { asOf: "2026-09-02T18:00:00+05:30" });
    expect(p.handovers).toHaveLength(1);
    expect(p.handovers[0].status).toBe("CONFIRMED");
  });
});
```

- [ ] **Step 2: Write `server/api/src/lib/history.js`**

```js
import { uuidv7 } from "@bhaav/core/ids";

const num = (d) => (d === null || d === undefined ? null : Number(d));
const iso = (d) => (d ? d.toISOString() : null);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Builds the POST /detect request body from AI.md section 11.
 *
 * The AI service is stateless and has no database access (AI.md section 11
 * rule 1, AI-ANOMALY-SPEC section 1 rule 2), so every history feature a
 * detector needs is computed HERE and passed in. The AI developer never
 * writes a query, and either side can be rebuilt or mocked without touching
 * the other.
 */
export async function buildDetectPayload(prisma, { asOf, runId = uuidv7() }) {
  const [categories, recyclers, rateRows, lots, acceptances, handovers] = await Promise.all([
    prisma.category.findMany(),
    prisma.recycler.findMany({ where: { authorizationStatus: "VALID" } }),
    prisma.rate.findMany({ where: { source: "RECYCLER_PUBLISHED" }, orderBy: { validFrom: "asc" } }),
    prisma.lot.findMany(),
    prisma.acceptance.findMany(),
    // Only two-signature records. An unsigned handover is not yet a statement
    // either party has agreed to, so it is not evidence of anything.
    prisma.handover.findMany({ where: { status: "CONFIRMED" } }),
  ]);

  // Edge case 23. D9 assumes independent graders. Two facilities in one
  // compound with one beneficial owner are ONE grader wearing two hats, and
  // the bias score comes out near zero — a false clean bill. Group them so
  // the detector can carry the caveat in `detail` rather than being silently
  // fooled. mpcb_recyclers.csv contains at least two such pairs.
  const groupKey = new Map();
  let nextGroup = 0;
  const byIdentity = new Map();
  for (const r of recyclers) {
    for (const key of [norm(r.phone), norm(r.email), norm(r.address)].filter((k) => k.length > 6)) {
      if (!byIdentity.has(key)) byIdentity.set(key, []);
      byIdentity.get(key).push(r.id);
    }
  }
  for (const ids of byIdentity.values()) {
    if (ids.length < 2) continue;
    const existing = ids.map((id) => groupKey.get(id)).find((g) => g !== undefined);
    const g = existing ?? `grp-${nextGroup++}`;
    for (const id of ids) groupKey.set(id, g);
  }

  const districtCount = new Map();
  for (const r of recyclers) {
    const d = r.district ?? "UNKNOWN";
    districtCount.set(d, (districtCount.get(d) ?? 0) + 1);
  }

  return {
    run_id: runId,
    as_of: asOf,
    categories: categories.map((c) => ({
      id: c.id,
      code: c.code,
      parent_id: c.parentId,
      // Both null until real field data lands. D4 and D5 must skip with a
      // reason until then (README open item 7), and the contract already
      // supports that.
      expected_qty_min: num(c.expectedQtyMin),
      expected_qty_max: num(c.expectedQtyMax),
    })),
    recyclers: recyclers.map((r) => ({
      id: r.id,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      district: r.district ?? "UNKNOWN",
      // D13 needs to know a district has exactly one valid buyer, because
      // there recycler bias is not degraded — it is mathematically
      // unidentifiable, and the honest output is a market finding.
      district_valid_recycler_count: districtCount.get(r.district ?? "UNKNOWN"),
      shared_identity_group: groupKey.get(r.id) ?? null,
    })),
    rates: rateRows.map((r) => ({
      recycler_id: r.recyclerId,
      category_id: r.categoryId,
      unit: r.unit,
      price: num(r.price),
      valid_from: iso(r.validFrom),
    })),
    lots: lots.map((l) => ({
      id: l.id,
      collector_id: l.collectorId,
      category_id: l.categoryId,
      unit: l.unit,
      quantity: num(l.quantity),
      condition: l.condition,
      estimated_value: num(l.estimatedValue),
      collection_lat: l.collectionLat,
      collection_lng: l.collectionLng,
      collection_ts: iso(l.collectionTs),
    })),
    acceptances: acceptances.map((a) => ({
      id: a.id,
      lot_id: a.lotId,
      recycler_id: a.recyclerId,
      accepted_rate: num(a.acceptedRate),
      accepted_unit: a.acceptedUnit,
      accepted_ts: iso(a.acceptedTs),
      recycler_response: a.recyclerResponse,
    })),
    handovers: handovers.map((h) => ({
      id: h.id,
      lot_id: h.lotId,
      recycler_id: h.recyclerId,
      inspected_quantity: num(h.inspectedQuantity),
      final_unit_price: num(h.finalUnitPrice),
      final_total: num(h.finalTotal),
      inspected_condition: h.inspectedCondition,
      downgrade_reason_code: h.downgradeReasonCode,
      collector_protest: h.collectorProtest,
      handover_lat: h.handoverLat,
      handover_lng: h.handoverLng,
      handover_ts: iso(h.handoverTs),
      status: h.status,
    })),
  };
}
```

- [ ] **Step 3: Run the history test**

```bash
npx vitest run server/api/test/history.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 4: Write `server/api/src/lib/aiml.js`**

```js
/**
 * AI-ANOMALY-SPEC section 1, addition 3: 2-second timeout, FAIL OPEN.
 *
 * A detector service that is down must never block a collector's sale. This
 * follows directly from AI.md section 5's "no detector ever blocks a
 * transaction" — the transaction proceeds unflagged and is re-scored by the
 * next batch run.
 */
export async function callDetect(payload, { url = process.env.AIML_URL, timeoutMs } = {}) {
  const ms = Number(timeoutMs ?? process.env.AIML_TIMEOUT_MS ?? 2000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${url}/detect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `aiml responded ${res.status}` };
    return { ok: true, body: await res.json() };
  } catch (err) {
    return { ok: false, reason: err.name === "AbortError" ? `timeout after ${ms}ms` : err.message };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 5: Write the failing detect-run test**

`server/api/test/detect.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";

const app = createApp();
let rec;
let agent;

function mockAiml(body, { status = 200, delayMs = 0 } = {}) {
  vi.stubGlobal("fetch", async (_url, opts) => {
    if (delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        opts?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }
    return { ok: status < 400, status, json: async () => body };
  });
}

beforeEach(async () => {
  await truncateAll();
  vi.unstubAllGlobals();
  rec = await makeRecycler();
  const cat = await makeCategory();
  const col = await makeCollector();
  const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
  await makeHandover({
    lotId: lot.id,
    recyclerId: rec.id,
    recyclerConfirmedAt: new Date(),
    collectorConfirmedAt: new Date(),
    status: "CONFIRMED",
  });
  await prisma.recyclerAccount.create({
    data: { recyclerId: rec.id, email: "r@bhaav.demo", passwordHash: await hashPassword("pw") },
  });
  agent = request.agent(app);
  await agent.post("/auth/login").send({ email: "r@bhaav.demo", password: "pw" });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await truncateAll();
  await prisma.$disconnect();
});

describe("POST /detect-run", () => {
  it("writes the returned flags field-for-field, unchanged", async () => {
    mockAiml({
      run_id: "run-1",
      config_version: "thresholds-v1",
      detectors_run: ["D1", "D6", "D7", "D8"],
      detectors_skipped: [{ code: "D2", reason: "insufficient data: 1 handover, need 10" }],
      flags: [
        {
          detector_code: "D1",
          subject_type: "HANDOVER",
          subject_id: "00000000-0000-7000-8000-000000000001",
          severity: "INFO",
          detail: { deviation: 0.31, threshold: 0.25 },
        },
      ],
    });
    const res = await agent.post("/detect-run").send({});
    expect(res.status).toBe(200);
    expect(res.body.flagsWritten).toBe(1);
    const flag = await prisma.anomalyFlag.findFirst();
    expect(flag.detectorCode).toBe("D1");
    expect(flag.severity).toBe("INFO");
    expect(flag.detail).toEqual({ deviation: 0.31, threshold: 0.25 });
    expect(flag.configVersion).toBe("thresholds-v1");
  });

  it("reports skipped detectors with their reason — this is what keeps the demo honest", async () => {
    mockAiml({
      run_id: "run-2",
      detectors_run: ["D1"],
      detectors_skipped: [
        { code: "D2", reason: "insufficient data: 1 handover, need 10" },
        { code: "D9", reason: "insufficient overlap: 0 shared collectors, need 10" },
      ],
      flags: [],
    });
    const res = await agent.post("/detect-run").send({});
    expect(res.body.detectorsSkipped.map((d) => d.code)).toEqual(["D2", "D9"]);
  });

  it("fails open when the service times out — the sale is never blocked", async () => {
    mockAiml({}, { delayMs: 500 });
    const res = await agent.post("/detect-run").send({ timeoutMs: 50 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.reason).toMatch(/timeout/);
    expect(await prisma.anomalyFlag.count()).toBe(0);
  });

  it("fails open when the service returns an error status", async () => {
    mockAiml({}, { status: 500 });
    const res = await agent.post("/detect-run").send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(await prisma.anomalyFlag.count()).toBe(0);
  });

  it("does not write a duplicate flag for the same subject, detector and run", async () => {
    const payload = {
      run_id: "run-3",
      detectors_run: ["D1"],
      detectors_skipped: [],
      flags: [
        {
          detector_code: "D1",
          subject_type: "HANDOVER",
          subject_id: "00000000-0000-7000-8000-000000000001",
          severity: "INFO",
          detail: { deviation: 0.31 },
        },
      ],
    };
    mockAiml(payload);
    await agent.post("/detect-run").send({});
    await agent.post("/detect-run").send({});
    expect(await prisma.anomalyFlag.count()).toBe(1);
  });

  it("rejects a flag whose severity is outside the vocabulary rather than storing it", async () => {
    mockAiml({
      run_id: "run-4",
      detectors_run: ["D1"],
      detectors_skipped: [],
      flags: [
        {
          detector_code: "D1",
          subject_type: "HANDOVER",
          subject_id: "00000000-0000-7000-8000-000000000001",
          severity: "APOCALYPTIC",
          detail: {},
        },
      ],
    });
    const res = await agent.post("/detect-run").send({});
    expect(res.body.flagsWritten).toBe(0);
    expect(res.body.flagsRejected).toHaveLength(1);
  });

  it("401s without a session", async () => {
    expect((await request(app).post("/detect-run").send({})).status).toBe(401);
  });
});
```

- [ ] **Step 6: Write `server/api/src/routes/detect.js`**

```js
import { Router } from "express";
import { prisma } from "../db.js";
import { SEVERITIES } from "@bhaav/core/constants";
import { requireRecycler } from "../middleware/session.js";
import { buildDetectPayload } from "../lib/history.js";
import { callDetect } from "../lib/aiml.js";

export const detectRouter = Router();
detectRouter.use(requireRecycler);

const SUBJECT_TYPES = ["LOT", "HANDOVER", "RECYCLER", "COLLECTOR", "MARKET"];

detectRouter.post("/", async (req, res, next) => {
  try {
    const asOf = req.body?.asOf ?? new Date().toISOString();
    const payload = await buildDetectPayload(prisma, { asOf });
    const result = await callDetect(payload, { timeoutMs: req.body?.timeoutMs });

    // FAIL OPEN. AI-ANOMALY-SPEC edge case 22: the transaction proceeds
    // unflagged, marked pending, and is re-scored by the next batch. A 200
    // here is correct — nothing went wrong for the collector.
    if (!result.ok) {
      return res.json({
        runId: payload.run_id,
        status: "pending",
        reason: result.reason,
        detectorsRun: [],
        detectorsSkipped: [],
        flagsWritten: 0,
        flagsRejected: [],
      });
    }

    const body = result.body;
    const written = [];
    const rejected = [];

    for (const flag of body.flags ?? []) {
      if (!SUBJECT_TYPES.includes(flag.subject_type) || !SEVERITIES.includes(flag.severity)) {
        rejected.push({ flag, reason: "subject_type or severity outside the vocabulary" });
        continue;
      }
      // The service never writes; the API decides what to persist (AI.md
      // section 11 rule 2). flags[] maps field-for-field onto anomaly_flag,
      // and the API inserts them unchanged.
      const existing = await prisma.anomalyFlag.findFirst({
        where: {
          detectorCode: flag.detector_code,
          subjectType: flag.subject_type,
          subjectId: flag.subject_id,
          runId: body.run_id ?? payload.run_id,
        },
        select: { id: true },
      });
      if (existing) continue;

      written.push(
        await prisma.anomalyFlag.create({
          data: {
            subjectType: flag.subject_type,
            subjectId: flag.subject_id,
            detectorCode: flag.detector_code,
            severity: flag.severity,
            detail: flag.detail ?? {},
            configVersion: body.config_version ?? null,
            runId: body.run_id ?? payload.run_id,
          },
        }),
      );
    }

    res.json({
      runId: body.run_id ?? payload.run_id,
      status: "ok",
      detectorsRun: body.detectors_run ?? [],
      // Reported, never hidden. This is how the minimum-data rule in AI.md
      // section 5 is enforced across the seam, and it is what makes the demo
      // honest: "insufficient data" beats a meaningless flag.
      detectorsSkipped: body.detectors_skipped ?? [],
      flagsWritten: written.length,
      flagsRejected: rejected,
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 7: Mount it and run the tests**

```js
import { detectRouter } from "./routes/detect.js";
```

```js
  app.use("/detect-run", detectRouter);
```

```bash
npx vitest run server/api/test/detect.test.js
```

Expected: PASS, 7 tests.

- [ ] **Step 8: Commit**

```bash
git add server/api/src/lib/history.js server/api/src/lib/aiml.js server/api/src/routes/detect.js server/api/src/app.js server/api/test/history.test.js server/api/test/detect.test.js
git commit -m "feat(api): detector orchestration — history features in, flags out, fail open at 2s

The API computes every history feature so server/aiml stays stateless and
database-free. A detector service that is down never blocks a sale."
```

---

## Task 21: `GET /recycler/flags` — plain language, visible to the flagged party

`AI.md` §5 rule 3: flags are visible to the flagged party. The system is not covert.

**Files:**
- Modify: `server/api/src/routes/recycler.js`
- Create: `server/api/src/lib/explain.js`
- Test: `server/api/test/recycler-flags.test.js`, `server/api/test/explain.test.js`

**Interfaces:**
- Produces: `explainFlag({ detectorCode, severity, detail }) -> string`; `GET /recycler/flags -> { flags[], alertBudget }`

- [ ] **Step 1: Write the failing explain test**

`server/api/test/explain.test.js`:

```js
import { describe, it, expect } from "vitest";
import { explainFlag } from "../src/lib/explain.js";

describe("explainFlag", () => {
  it("explains D2 from its triggering numbers", () => {
    expect(explainFlag({ detectorCode: "D2", detail: { median_ratio: 0.78, n: 14, threshold: 0.85 } })).toBe(
      "Across 14 completed handovers, the amount paid was a median of 78% of the rate published at acceptance, below the 85% threshold.",
    );
  });

  it("explains D9 without asserting dishonesty", () => {
    const s = explainFlag({
      detectorCode: "D9",
      detail: { grader_bias: 0.71, shared_collectors: 12, threshold: 0.35 },
    });
    expect(s).toMatch(/12 collectors who also sold elsewhere/);
    expect(s).toMatch(/71 percentage points more often/);
    expect(s).not.toMatch(/fraud|lying|dishonest/i);
  });

  it("carries the shared-ownership caveat when the detail names one", () => {
    const s = explainFlag({
      detectorCode: "D9",
      detail: { grader_bias: 0.71, shared_collectors: 12, threshold: 0.35, shared_identity_group: "grp-0" },
    });
    expect(s).toMatch(/shares an address, phone or email/i);
  });

  it("explains D13 as a market finding, not a person", () => {
    expect(
      explainFlag({
        detectorCode: "D13",
        detail: { valid_recyclers: 1, downgrade_rate: 0.85, n: 31, district: "Buldhana" },
      }),
    ).toMatch(/only one authorised buyer/i);
  });

  it("falls back to the raw numbers rather than inventing a sentence", () => {
    expect(explainFlag({ detectorCode: "D99", detail: { x: 1 } })).toBe(
      'Detector D99 fired. Triggering values: {"x":1}',
    );
  });
});
```

- [ ] **Step 2: Write `server/api/src/lib/explain.js`**

```js
const pct = (n) => `${Math.round(Number(n) * 100)}%`;
const pp = (n) => `${Math.round(Number(n) * 100)} percentage points`;

// AI-ANOMALY-SPEC gap 3: the response carries `detail` numbers, and the console
// must render a sentence. The rule that fired names the reason — rules explain,
// scores rank.
//
// Section 11: never say "AI detects fraud", never present a score as a
// probability of fraud. Every sentence below states what was measured, never
// what it means about a person.
const TEMPLATES = {
  D1: (d) =>
    `The amount paid differed from the rate published at acceptance by ${pct(d.deviation)}, above the ${pct(d.threshold)} threshold. A single gap like this is usually a negotiation after inspection.`,
  D2: (d) =>
    `Across ${d.n} completed handovers, the amount paid was a median of ${pct(d.median_ratio)} of the rate published at acceptance, below the ${pct(d.threshold)} threshold.`,
  D3: (d) =>
    `The published rate for this category moved ${pct(d.change)} on ${d.change_date} and returned to its previous level within ${d.revert_hours} hours.`,
  D6: (d) =>
    `Two lots from the same collector in the same category, quantities within ${pct(d.quantity_tolerance)}, were recorded ${d.minutes_apart} minutes apart.`,
  D7: (d) =>
    `The collection point and the handover point are ${Number(d.distance_km).toFixed(1)} km apart, ${d.hours_apart} hours apart — an implied ${Math.round(d.implied_kmph)} km/h.`,
  D8: (d) =>
    `${d.count} handovers were recorded within ${d.seconds} seconds at coordinates inside a ${d.radius_m} metre radius.`,
  D9: (d) =>
    `Among ${d.shared_collectors} collectors who also sold elsewhere, this facility recorded a lower grade than other facilities did ${pp(d.grader_bias)} more often.${
      d.shared_identity_group
        ? " Confidence caveat: this facility shares an address, phone or email with another on the list, and two facilities under one owner grade as one."
        : ""
    }`,
  D10: (d) =>
    `The downgrade rate over the last 30 days is ${pct(d.recent_rate)}, against ${pct(d.baseline_rate)} over the preceding 90 days.`,
  D11: (d) =>
    `The downgrade rate is close to uniform across ${d.categories} categories (variance ${Number(d.variance).toFixed(3)}) at a mean of ${pct(d.mean_rate)}. Genuine quality problems are usually category-specific.`,
  D12: (d) =>
    `Over ${d.n} handovers across ${d.days} days, the gap between the published rate and the amount paid stayed at a median of ${pct(d.median_drop)} with no downward trend in the published rate.`,
  D13: (d) =>
    `${d.district} has only one authorised buyer on the current list, with a downgrade rate of ${pct(d.downgrade_rate)} over ${d.n} handovers. Where there is one buyer, a single facility's grading cannot be compared with anyone else's — this is a finding about the market, not about a business.`,
  D14: (d) =>
    `${d.matches} inspection photographs are near-duplicates of images submitted with other handovers. Suggestive only — it is not proof of anything on its own.`,
};

export function explainFlag({ detectorCode, detail }) {
  const fn = TEMPLATES[detectorCode];
  if (!fn) return `Detector ${detectorCode} fired. Triggering values: ${JSON.stringify(detail)}`;
  try {
    return fn(detail ?? {});
  } catch {
    return `Detector ${detectorCode} fired. Triggering values: ${JSON.stringify(detail)}`;
  }
}
```

- [ ] **Step 3: Run the explain test**

```bash
npx vitest run server/api/test/explain.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 4: Write the failing flags test**

`server/api/test/recycler-flags.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import {
  prisma,
  truncateAll,
  makeCategory,
  makeRecycler,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";

const app = createApp();
let rec;
let other;
let agent;

beforeEach(async () => {
  await truncateAll();
  rec = await makeRecycler({ name: "Mine" });
  other = await makeRecycler({ name: "Theirs" });
  await prisma.recyclerAccount.create({
    data: { recyclerId: rec.id, email: "r@bhaav.demo", passwordHash: await hashPassword("pw") },
  });
  agent = request.agent(app);
  await agent.post("/auth/login").send({ email: "r@bhaav.demo", password: "pw" });
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

const flag = (over = {}) =>
  prisma.anomalyFlag.create({
    data: {
      subjectType: "RECYCLER",
      subjectId: rec.id,
      detectorCode: "D2",
      severity: "WARN",
      detail: { median_ratio: 0.78, n: 14, threshold: 0.85 },
      configVersion: "thresholds-v1",
      ...over,
    },
  });

describe("GET /recycler/flags", () => {
  it("shows this facility its own flags — the system is not covert", async () => {
    await flag();
    const res = await agent.get("/recycler/flags");
    expect(res.body.flags).toHaveLength(1);
    expect(res.body.flags[0].detectorCode).toBe("D2");
  });

  it("renders each flag as a plain-language sentence", async () => {
    await flag();
    const res = await agent.get("/recycler/flags");
    expect(res.body.flags[0].explanation).toMatch(/median of 78%/);
  });

  it("returns the triggering numbers alongside the sentence", async () => {
    await flag();
    const res = await agent.get("/recycler/flags");
    expect(res.body.flags[0].detail).toEqual({ median_ratio: 0.78, n: 14, threshold: 0.85 });
  });

  it("excludes another facility's flags", async () => {
    await flag({ subjectId: other.id });
    expect((await agent.get("/recycler/flags")).body.flags).toHaveLength(0);
  });

  it("includes flags on this facility's own handovers, not only on the facility", async () => {
    const cat = await makeCategory();
    const col = await makeCollector();
    const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
    const h = await makeHandover({ lotId: lot.id, recyclerId: rec.id });
    await flag({ subjectType: "HANDOVER", subjectId: h.id, detectorCode: "D1", severity: "INFO", detail: { deviation: 0.31, threshold: 0.25 } });
    const res = await agent.get("/recycler/flags");
    expect(res.body.flags.map((f) => f.detectorCode)).toContain("D1");
  });

  it("reports the alert budget so a flood is visible as a flood", async () => {
    const cat = await makeCategory();
    const col = await makeCollector();
    for (let i = 0; i < 4; i += 1) {
      const lot = await makeLot({ collectorId: col.id, categoryId: cat.id });
      await makeHandover({ lotId: lot.id, recyclerId: rec.id, referenceCode: `REF0000${i}` });
    }
    await flag();
    const res = await agent.get("/recycler/flags");
    expect(res.body.alertBudget).toEqual({ flagged: 1, transactions: 4, rate: 0.25, target: 0.05, withinTarget: false });
  });

  it("orders CRITICAL before WARN before INFO", async () => {
    await flag({ severity: "INFO", detectorCode: "D1", detail: { deviation: 0.3, threshold: 0.25 } });
    await flag({ severity: "CRITICAL", detectorCode: "D9", detail: { grader_bias: 0.71, shared_collectors: 22, threshold: 0.6 } });
    await flag({ severity: "WARN" });
    const res = await agent.get("/recycler/flags");
    expect(res.body.flags.map((f) => f.severity)).toEqual(["CRITICAL", "WARN", "INFO"]);
  });
});
```

- [ ] **Step 5: Append to `server/api/src/routes/recycler.js`**

```js
import { explainFlag } from "../lib/explain.js";

const SEVERITY_RANK = { CRITICAL: 0, WARN: 1, INFO: 2 };

recyclerRouter.get("/flags", async (req, res, next) => {
  try {
    const handovers = await prisma.handover.findMany({
      where: { recyclerId: req.recyclerId },
      select: { id: true, lotId: true },
    });
    const subjectIds = [
      req.recyclerId,
      ...handovers.map((h) => h.id),
      ...handovers.map((h) => h.lotId),
    ];

    const rows = await prisma.anomalyFlag.findMany({
      where: { subjectId: { in: subjectIds } },
      orderBy: { createdAt: "desc" },
    });

    const flags = rows
      .map((f) => ({
        id: f.id,
        detectorCode: f.detectorCode,
        subjectType: f.subjectType,
        subjectId: f.subjectId,
        severity: f.severity,
        detail: f.detail,
        // AI.md section 5 rule 2: every flag is explainable in one sentence,
        // rendered from the numbers that triggered it.
        explanation: explainFlag({ detectorCode: f.detectorCode, detail: f.detail }),
        configVersion: f.configVersion,
        adminOutcome: f.adminOutcome,
        createdAt: f.createdAt.toISOString(),
        resolvedAt: f.resolvedAt?.toISOString() ?? null,
      }))
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    // AI-ANOMALY-SPEC gap 5: precision over recall, alert budget at most 5% of
    // transactions. A warning nobody trusts is worse than no warning, so the
    // rate is reported next to the flags rather than left for someone to
    // notice.
    const transactions = handovers.length;
    res.json({
      flags,
      alertBudget: {
        flagged: flags.length,
        transactions,
        rate: transactions ? flags.length / transactions : 0,
        target: 0.05,
        withinTarget: transactions ? flags.length / transactions <= 0.05 : true,
      },
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npx vitest run server/api/test/recycler-flags.test.js
```

Expected: PASS, 7 tests.

- [ ] **Step 7: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS across `packages/core` and `server/api` — roughly 145 tests.

- [ ] **Step 8: Verify end to end against the running stack**

```bash
npm run seed
npm -w @bhaav/api run dev &
sleep 2
curl -s -c /tmp/bhaav.jar -X POST localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"lilashana.sales@bhaav.demo","password":"bhaav-demo-2026"}'
echo
curl -s -b /tmp/bhaav.jar localhost:4000/recycler/rates | head -c 400
echo
curl -s -b /tmp/bhaav.jar localhost:4000/recycler/flags
kill %1
```

Expected: a `recycler` object on login, a rates list with 16 category rows, and `{"flags":[],"alertBudget":{"flagged":0,"transactions":0,"rate":0,"target":0.05,"withinTarget":true}}`. If the login email differs, read it from `psql -d bhaav -c "SELECT email FROM recycler_account;"`.

- [ ] **Step 9: Commit**

```bash
git add server/api/src/routes/recycler.js server/api/src/lib/explain.js server/api/test/recycler-flags.test.js server/api/test/explain.test.js
git commit -m "feat(api): recycler flags screen with plain-language reasons and the alert budget

Flags are visible to the flagged party by design, and every sentence states
what was measured rather than what it means about a business."
```

---

## Backend done — what exists now

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness + database reachability |
| `GET /sync/bootstrap` | categories, valid recyclers, current rates, condition factors |
| `GET /sync/delta?since=` | changes since a cursor, plus `removedRecyclerIds` |
| `POST /sync/push` | idempotent batched outbox upsert |
| `POST /photos` · `GET /photos/:id` | deferred photo upload with sha256 verification |
| `POST /handover/:lot_id/confirm` | the collector's signature — closes the record |
| `POST /auth/login` · `/logout` · `GET /auth/me` | console session |
| `GET`/`POST /recycler/rates` | append-only rate publishing |
| `GET /recycler/acceptances` · `POST /recycler/acceptances/:id/respond` | incoming, acknowledge, decline |
| `GET /lots/:reference_code` | QR lookup |
| `POST /handover` | recycler submits inspected quantity and final price |
| `GET /recycler/history` | three prices per row, actually-paid summary, CSV |
| `POST /detect-run` | history features → `server/aiml` → `anomaly_flag` |
| `GET /recycler/flags` | own flags, plain language, alert budget |

Plan 02 (collector app) and plan 03 (console) consume this surface. Plan 04 provides `/detect` and `/simulate`.
