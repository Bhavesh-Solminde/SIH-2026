/**
 * Tests for POST /reports/:lot_id — a collector-initiated "something is
 * wrong" report, filed from the app's Earnings history against a transaction
 * that may already be CONFIRMED. Deliberately separate from
 * POST /handover/:lot_id/dispute, which refuses once collectorConfirmedAt is
 * set (handover-dispute.test.js covers that 409).
 *
 * DB: bhaav_test (port 5433). Serial execution. truncateAll in beforeEach.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  prisma, truncateAll, makeCategory, makeRecycler, makeCollector, makeLot, makeHandover,
} from "./helpers/db.js";
import { uuidv7 } from "@bhaav/core/ids";
import { hashPassword } from "../src/lib/password.js";

afterAll(() => prisma.$disconnect());

async function setup(handoverOverrides = {}) {
  const category = await makeCategory();
  const recycler = await makeRecycler();
  const collector = await makeCollector();
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id });
  const handover = await makeHandover({
    lotId: lot.id,
    recyclerId: recycler.id,
    ...handoverOverrides,
  });
  return { lot, handover, recycler };
}

async function setupAdmin(app) {
  const account = await prisma.recyclerAccount.create({
    data: {
      recyclerId: null,
      email: `admin-${uuidv7().slice(0, 6)}@example.com`,
      passwordHash: await hashPassword("password"),
      role: "ADMIN",
    },
  });
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email: account.email, password: "password" });
  return agent;
}

describe("POST /reports/:lot_id", () => {
  beforeEach(() => truncateAll());

  it("201 — records a report against an already-CONFIRMED handover", async () => {
    const app = createApp();
    const { lot, handover } = await setup({
      status: "CONFIRMED",
      recyclerConfirmedAt: new Date(),
      collectorConfirmedAt: new Date(),
    });

    const res = await request(app)
      .post(`/reports/${lot.id}`)
      .send({ reason: "The recycler paid less than what was shown on my phone." });

    expect(res.status).toBe(201);
    expect(res.body.handover_id).toBe(handover.id);
    expect(res.body.status).toBe("OPEN");

    const row = await prisma.collectorReport.findUnique({ where: { id: res.body.report_id } });
    expect(row.handoverId).toBe(handover.id);
    expect(row.reason).toBe("The recycler paid less than what was shown on my phone.");
    expect(row.status).toBe("OPEN");
  });

  it("201 — also works against a PENDING_COLLECTOR handover (not just CONFIRMED)", async () => {
    const app = createApp();
    const { lot } = await setup();

    const res = await request(app).post(`/reports/${lot.id}`).send({ reason: "wrong quantity" });
    expect(res.status).toBe(201);
  });

  it("does not require the handover to be untouched by dispute — reports and disputes are independent", async () => {
    const app = createApp();
    const { lot } = await setup({ status: "DISPUTED", collectorProtest: true });

    const res = await request(app).post(`/reports/${lot.id}`).send({ reason: "still wrong after dispute" });
    expect(res.status).toBe(201);
  });

  it("400 — reason is required", async () => {
    const app = createApp();
    const { lot } = await setup();

    const res = await request(app).post(`/reports/${lot.id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reason_required");
  });

  it("400 — blank/whitespace-only reason is rejected", async () => {
    const app = createApp();
    const { lot } = await setup();

    const res = await request(app).post(`/reports/${lot.id}`).send({ reason: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reason_required");
  });

  it("400 — reason over the length limit is rejected", async () => {
    const app = createApp();
    const { lot } = await setup();

    const res = await request(app).post(`/reports/${lot.id}`).send({ reason: "x".repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reason_too_long");
  });

  it("400 — malformed lot_id", async () => {
    const app = createApp();
    const res = await request(app).post("/reports/not-a-uuid").send({ reason: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_lot_id");
  });

  it("404 — no handover exists for this lot", async () => {
    const app = createApp();
    const res = await request(app).post(`/reports/${uuidv7()}`).send({ reason: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("handover_not_found");
  });

  it("allows multiple reports on the same handover — each is its own record", async () => {
    const app = createApp();
    const { lot } = await setup({ status: "CONFIRMED", recyclerConfirmedAt: new Date(), collectorConfirmedAt: new Date() });

    const first = await request(app).post(`/reports/${lot.id}`).send({ reason: "first issue" });
    const second = await request(app).post(`/reports/${lot.id}`).send({ reason: "second issue" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.report_id).not.toBe(second.body.report_id);

    const count = await prisma.collectorReport.count({ where: { handoverId: first.body.handover_id } });
    expect(count).toBe(2);
  });
});

describe("GET /reports — admin read side", () => {
  beforeEach(() => truncateAll());

  it("401 — requires a session", async () => {
    const app = createApp();
    const res = await request(app).get("/reports");
    expect(res.status).toBe(401);
  });

  it("403 — a recycler session is not enough, must be ADMIN", async () => {
    const app = createApp();
    const { lot } = await setup({ status: "CONFIRMED", recyclerConfirmedAt: new Date(), collectorConfirmedAt: new Date() });
    await request(app).post(`/reports/${lot.id}`).send({ reason: "x" });

    const passwordHash = await hashPassword("secret");
    const account = await prisma.recyclerAccount.create({
      data: { recyclerId: (await makeRecycler()).id, email: `r-${uuidv7().slice(0, 6)}@example.com`, passwordHash },
    });
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ email: account.email, password: "secret" });

    const res = await agent.get("/reports");
    expect(res.status).toBe(403);
  });

  it("200 — lists OPEN reports by default, with handover/recycler/lot context", async () => {
    const app = createApp();
    const { lot, recycler } = await setup({
      status: "CONFIRMED", recyclerConfirmedAt: new Date(), collectorConfirmedAt: new Date(),
      finalTotal: "500.00",
    });
    await request(app).post(`/reports/${lot.id}`).send({ reason: "paid less than agreed" });

    const admin = await setupAdmin(app);
    const res = await admin.get("/reports");

    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(1);
    const r = res.body.reports[0];
    expect(r.status).toBe("OPEN");
    expect(r.reason).toBe("paid less than agreed");
    expect(r.recycler.id).toBe(recycler.id);
    expect(r.recycler.name).toBe(recycler.name);
    expect(r.final_total).toBe(500);
    expect(r.reference_code).toBeTruthy();
  });

  it("?status=REVIEWED excludes OPEN reports, and vice versa", async () => {
    const app = createApp();
    const { lot } = await setup({ status: "CONFIRMED", recyclerConfirmedAt: new Date(), collectorConfirmedAt: new Date() });
    const created = await request(app).post(`/reports/${lot.id}`).send({ reason: "x" });

    const admin = await setupAdmin(app);
    const openBefore = await admin.get("/reports?status=OPEN");
    expect(openBefore.body.reports).toHaveLength(1);

    await admin.post(`/reports/${created.body.report_id}/resolve`);

    const openAfter = await admin.get("/reports?status=OPEN");
    expect(openAfter.body.reports).toHaveLength(0);

    const reviewed = await admin.get("/reports?status=REVIEWED");
    expect(reviewed.body.reports).toHaveLength(1);

    const all = await admin.get("/reports?status=all");
    expect(all.body.reports).toHaveLength(1);
  });

  it("400 — rejects an unknown status value", async () => {
    const app = createApp();
    const admin = await setupAdmin(app);
    const res = await admin.get("/reports?status=BOGUS");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_status");
  });
});

describe("POST /reports/:id/resolve — admin read side", () => {
  beforeEach(() => truncateAll());

  it("200 — marks an OPEN report REVIEWED", async () => {
    const app = createApp();
    const { lot } = await setup({ status: "CONFIRMED", recyclerConfirmedAt: new Date(), collectorConfirmedAt: new Date() });
    const created = await request(app).post(`/reports/${lot.id}`).send({ reason: "x" });

    const admin = await setupAdmin(app);
    const res = await admin.post(`/reports/${created.body.report_id}/resolve`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REVIEWED");

    const row = await prisma.collectorReport.findUnique({ where: { id: created.body.report_id } });
    expect(row.status).toBe("REVIEWED");
  });

  it("is idempotent — resolving an already-REVIEWED report just returns it", async () => {
    const app = createApp();
    const { lot } = await setup({ status: "CONFIRMED", recyclerConfirmedAt: new Date(), collectorConfirmedAt: new Date() });
    const created = await request(app).post(`/reports/${lot.id}`).send({ reason: "x" });

    const admin = await setupAdmin(app);
    const first = await admin.post(`/reports/${created.body.report_id}/resolve`);
    const second = await admin.post(`/reports/${created.body.report_id}/resolve`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("REVIEWED");
  });

  it("404 — unknown report id", async () => {
    const app = createApp();
    const admin = await setupAdmin(app);
    const res = await admin.post(`/reports/${uuidv7()}/resolve`);
    expect(res.status).toBe(404);
  });

  it("401/403 — same auth gate as the list endpoint", async () => {
    const app = createApp();
    const { lot } = await setup({ status: "CONFIRMED", recyclerConfirmedAt: new Date(), collectorConfirmedAt: new Date() });
    const created = await request(app).post(`/reports/${lot.id}`).send({ reason: "x" });

    const anon = await request(app).post(`/reports/${created.body.report_id}/resolve`);
    expect(anon.status).toBe(401);
  });
});
