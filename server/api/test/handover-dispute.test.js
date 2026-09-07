/**
 * Tests for the collector's half of the two-sided handover that had no
 * implementation behind it:
 *
 *   POST /handover/:lot_id/dispute   — the collector rejects the final price
 *   GET  /handover/by-lot/:lot_id    — what state is this lot's handover in
 *   POST /handover with final_unit_price — the recycler states a settled price
 *
 * Before these, a collector shown a price they disagreed with could only
 * accept it: the app's dispute control was a disabled "coming soon" pill and
 * the confirm screen's "wrong" button wrote to a local database the shipped
 * build never opens. The recorded history therefore contained agreements and
 * nothing else, which is not the same thing as everyone having agreed.
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
} from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";
import { uuidv7 } from "@bhaav/core/ids";

afterAll(() => prisma.$disconnect());

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
// POST /handover/:lot_id/dispute
// ---------------------------------------------------------------------------
describe("POST /handover/:lot_id/dispute", () => {
  beforeEach(() => truncateAll());

  it("marks the handover DISPUTED and records the collector's protest", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);
    await agent.post("/handover").send({ lot_id: lot.id, inspected_condition: "POOR", final_unit_price: 266 });

    const res = await request(app).post(`/handover/${lot.id}/dispute`).send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DISPUTED");
    expect(res.body.collector_protest).toBe(true);

    const row = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(row.status).toBe("DISPUTED");
    expect(row.collectorProtest).toBe(true);
    // A protest is not a signature — the collector never signed for this one.
    expect(row.collectorConfirmedAt).toBeNull();
  });

  it("is idempotent — disputing twice leaves one DISPUTED handover, not an error", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);
    await agent.post("/handover").send({ lot_id: lot.id, inspected_condition: "FAIR", final_unit_price: 323 });

    await request(app).post(`/handover/${lot.id}/dispute`).send({});
    const second = await request(app).post(`/handover/${lot.id}/dispute`).send({});

    expect(second.status).toBe(200);
    expect(second.body.status).toBe("DISPUTED");
  });

  it("refuses to reopen a handover the collector has already counter-signed", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);
    await agent.post("/handover").send({ lot_id: lot.id, inspected_condition: "GOOD", final_unit_price: 380 });
    await request(app).post(`/handover/${lot.id}/confirm`).send();

    const res = await request(app).post(`/handover/${lot.id}/dispute`).send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("already_confirmed");

    const row = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(row.status).toBe("CONFIRMED");
    expect(row.collectorProtest).toBe(false);
  });

  it("404s for a lot with no handover to dispute", async () => {
    const app = createApp();
    const { lot } = await setupFull();

    const res = await request(app).post(`/handover/${lot.id}/dispute`).send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("handover_not_found");
  });
});

// ---------------------------------------------------------------------------
// GET /handover/by-lot/:lot_id
// ---------------------------------------------------------------------------
describe("GET /handover/by-lot/:lot_id", () => {
  beforeEach(() => truncateAll());

  it("returns the handover with its price and status so a reload can resume", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);
    await agent.post("/handover").send({ lot_id: lot.id, inspected_condition: "FAIR", final_unit_price: 323 });

    const res = await request(app).get(`/handover/by-lot/${lot.id}`);

    expect(res.status).toBe(200);
    expect(res.body.handover.lot_id).toBe(lot.id);
    expect(res.body.handover.status).toBe("PENDING_COLLECTOR");
    expect(res.body.handover.inspected_condition).toBe("FAIR");
    // The recycler-settled price, over a 3 KG lot.
    expect(res.body.handover.final_unit_price).toBeCloseTo(323, 2);
    expect(res.body.handover.final_total).toBeCloseTo(969, 2);
    expect(res.body.handover.collector_confirmed_at).toBeNull();
  });

  it("404s when the lot has not been inspected yet — the normal case, not a failure", async () => {
    const app = createApp();
    const { lot } = await setupFull();

    const res = await request(app).get(`/handover/by-lot/${lot.id}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("handover_not_found");
  });
});

// ---------------------------------------------------------------------------
// POST /handover — the recycler-settled final price
// ---------------------------------------------------------------------------
describe("POST /handover with a recycler-settled final_unit_price", () => {
  beforeEach(() => truncateAll());

  it("stores the price the recycler sent, not a grade-derived one", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);

    // GOOD's old derivation would have been 380 × 1.0 = 380. The yard
    // settled on 402.50 instead — that is the number that must be stored.
    const res = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "GOOD",
      final_unit_price: 402.5,
    });

    expect(res.status).toBe(200);
    expect(res.body.final_unit_price).toBeCloseTo(402.5, 2);
    // 402.50 over the 3 KG lot from makeLot.
    expect(res.body.final_total).toBeCloseTo(1207.5, 2);

    const row = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(Number(row.finalUnitPrice)).toBeCloseTo(402.5, 2);
    expect(Number(row.finalTotal)).toBeCloseTo(1207.5, 2);
  });

  it("400s when no price is sent — the server no longer derives one", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "POOR",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("final_unit_price_required");
    expect(await prisma.handover.findUnique({ where: { lotId: lot.id } })).toBeNull();
  });

  it("rejects a negative price rather than letting the database constraint 500", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "GOOD",
      final_unit_price: -10,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_final_unit_price");
    expect(await prisma.handover.findUnique({ where: { lotId: lot.id } })).toBeNull();
  });

  it("rejects a non-numeric price", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);

    const res = await agent.post("/handover").send({
      lot_id: lot.id,
      inspected_condition: "GOOD",
      final_unit_price: "not a price",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_final_unit_price");
  });

  it("returns the existing handover's price when one already exists for the lot", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);
    await agent.post("/handover").send({ lot_id: lot.id, inspected_condition: "GOOD", final_unit_price: 380 });

    // The console hits this whenever a recycler reloads /verify?ref=… after
    // submitting; it needs the whole row back, not just an error string.
    const res = await agent.post("/handover").send({ lot_id: lot.id, inspected_condition: "POOR", final_unit_price: 266 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("handover_already_exists");
    expect(res.body.status).toBe("PENDING_COLLECTOR");
    expect(res.body.inspected_condition).toBe("GOOD");
    // 380 × 3 KG (the first call's settled price), not the second call's.
    expect(res.body.final_total).toBeCloseTo(1140, 2);
    expect(res.body.reference_code).toBeTruthy();
  });
});
