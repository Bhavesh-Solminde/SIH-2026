/**
 * Tests for:
 *   T16 — POST /handover          (recycler submits inspected condition)
 *   T17 — POST /handover/:lot_id/confirm  (collector counter-signs)
 *
 * DB: bhaav_test (port 5433). Serial execution. truncateAll in beforeEach.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  prisma,
  truncateAll,
  makeRecycler,
  makeCategory,
  makeCollector,
  makeLot,
  makeHandover,
} from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";
import { uuidv7 } from "@bhaav/core/ids";

afterAll(() => prisma.$disconnect());

// ---------------------------------------------------------------------------
// Shared fixture builder
// ---------------------------------------------------------------------------
async function setupFull({ recyclerResponse = "ACKNOWLEDGED" } = {}) {
  const recycler = await makeRecycler();
  const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });
  const collector = await makeCollector();
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id });

  const passwordHash = await hashPassword("secret");
  const account = await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email: `r-${uuidv7().slice(0, 6)}@example.com`, passwordHash },
  });

  const acceptance = await prisma.acceptance.create({
    data: {
      id: uuidv7(),
      lotId: lot.id,
      recyclerId: recycler.id,
      acceptedRate: "380.00",
      acceptedUnit: "KG",
      acceptedTs: new Date(),
      recyclerResponse,
    },
  });

  return { recycler, account, lot, acceptance, category, collector };
}

async function loginAgent(app, email, password = "secret") {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password });
  return agent;
}

// ---------------------------------------------------------------------------
// POST /handover — T16
// ---------------------------------------------------------------------------
describe("POST /handover", () => {
  beforeEach(() => truncateAll());

  // Test 1: happy path
  it("happy path — creates handover, returns 200 with inspected_condition", async () => {
    const app = createApp();
    const { account, lot } = await setupFull({ recyclerResponse: "ACKNOWLEDGED" });
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "GOOD",
    });

    expect(res.status).toBe(200);
    expect(res.body.handover_id).toBeTruthy();
    expect(res.body.lot_id).toBe(lot.id);
    expect(res.body.inspected_condition).toBe("GOOD");
    expect(res.body.completed_at).toBeTruthy();

    // Verify the row was actually created in the DB
    const row = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(row).not.toBeNull();
    expect(row.inspectedCondition).toBe("GOOD");
    expect(row.status).toBe("PENDING_COLLECTOR");
    expect(row.recyclerConfirmedAt).not.toBeNull();
  });

  // Test 2: 403 — no acknowledged acceptance
  it("403 — no acknowledged acceptance for this recycler on this lot", async () => {
    const app = createApp();
    // acceptance exists but with status NONE (default)
    const { account, lot } = await setupFull({ recyclerResponse: "NONE" });
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "FAIR",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("no_acknowledged_acceptance");
  });

  // Test 3: 409 — duplicate call for same lot is idempotent
  it("409 — second call to same lot returns conflict", async () => {
    const app = createApp();
    const { account, lot } = await setupFull({ recyclerResponse: "ACKNOWLEDGED" });
    const agent = await loginAgent(app, account.email);

    const first = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "GOOD",
    });
    expect(first.status).toBe(200);

    const second = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "FAIR",
    });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("handover_already_exists");
  });

  // Additional: 404 when lot does not exist
  it("404 — lot not found", async () => {
    const app = createApp();
    const { account } = await setupFull({ recyclerResponse: "ACKNOWLEDGED" });
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/handover").send({
      lot_id: uuidv7(),
      inspected_condition: "GOOD",
    });

    expect(res.status).toBe(404);
  });

  // Additional: 401 without session
  it("401 — requires session", async () => {
    const { lot } = await setupFull({ recyclerResponse: "ACKNOWLEDGED" });
    const res = await request(createApp()).post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "GOOD",
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /handover/:lot_id/confirm — T17
// ---------------------------------------------------------------------------
describe("POST /handover/:lot_id/confirm", () => {
  beforeEach(() => truncateAll());

  // Test 4: happy path — confirms handover, returns confirmed_at + final_price
  it("happy path — sets confirmed_at, returns confirmed_at and final_price", async () => {
    const app = createApp();
    const { account, lot } = await setupFull({ recyclerResponse: "ACKNOWLEDGED" });
    const agent = await loginAgent(app, account.email);

    // First the recycler submits the handover
    const postRes = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "GOOD",
    });
    expect(postRes.status).toBe(200);
    const handover_id = postRes.body.handover_id;

    // Now the collector confirms (no auth required)
    const confirmRes = await request(app)
      .post(`/handover/${lot.id}/confirm`)
      .send();

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.handover_id).toBe(handover_id);
    expect(confirmRes.body.lot_id).toBe(lot.id);
    expect(confirmRes.body.confirmed_at).toBeTruthy();
    expect(typeof confirmRes.body.final_price).toBe("number");
    expect(confirmRes.body.final_price).toBeGreaterThan(0);

    // Verify the DB row is now CONFIRMED with both timestamps set
    const row = await prisma.handover.findUnique({ where: { id: handover_id } });
    expect(row.status).toBe("CONFIRMED");
    expect(row.collectorConfirmedAt).not.toBeNull();
    expect(row.recyclerConfirmedAt).not.toBeNull();
  });

  // Test 5: 404 when trying to confirm an already-confirmed handover
  it("404 — already confirmed handover returns 404", async () => {
    const app = createApp();
    const { account, lot } = await setupFull({ recyclerResponse: "ACKNOWLEDGED" });
    const agent = await loginAgent(app, account.email);

    // Create handover via recycler
    await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "FAIR",
    });

    // First confirm
    const first = await request(app)
      .post(`/handover/${lot.id}/confirm`)
      .send();
    expect(first.status).toBe(200);

    // Second confirm — should 404
    const second = await request(app)
      .post(`/handover/${lot.id}/confirm`)
      .send();
    expect(second.status).toBe(404);
    expect(second.body.error).toBe("handover_not_found_or_already_confirmed");
  });

  // Test 5b: 404 when handover doesn't exist at all
  it("404 — no handover for this lot", async () => {
    const res = await request(createApp())
      .post(`/handover/${uuidv7()}/confirm`)
      .send();
    expect(res.status).toBe(404);
  });

  // Test 6: Final price calculation — verify rate × quantity × condition_factor
  it("final price calculation — rate × quantity × condition_factor", async () => {
    const app = createApp();
    const { account, lot, acceptance } = await setupFull({ recyclerResponse: "ACKNOWLEDGED" });
    const agent = await loginAgent(app, account.email);

    // Use FAIR condition: factor = 0.85
    // accepted_rate = 380.00, quantity = 3.000 (from makeLot)
    // final_unit_price = 380 × 0.85 = 323.00
    // final_total = 323 × 3 = 969.00
    const expectedRate = Number(acceptance.acceptedRate);   // 380
    const expectedFactor = 0.85;                           // FAIR
    const expectedUnitPrice = +(expectedRate * expectedFactor).toFixed(2); // 323.00
    const expectedTotal = +(expectedUnitPrice * Number(lot.quantity)).toFixed(2); // 969.00

    await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "FAIR",
    });

    const confirmRes = await request(app)
      .post(`/handover/${lot.id}/confirm`)
      .send();

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.final_price).toBeCloseTo(expectedTotal, 2);

    // Also verify the stored values
    const row = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(Number(row.finalUnitPrice)).toBeCloseTo(expectedUnitPrice, 2);
    expect(Number(row.finalTotal)).toBeCloseTo(expectedTotal, 2);
  });
});
