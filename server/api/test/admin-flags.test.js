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

afterAll(() => prisma.$disconnect());

async function setupAdmin() {
  const password = "password";
  const account = await prisma.recyclerAccount.create({
    data: {
      recyclerId: null,
      email: "admin@example.com",
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    },
  });
  const app = createApp();
  const agent = request.agent(app);
  const res = await agent.post("/auth/login").send({ email: account.email, password });
  return { account, agent, app, loginBody: res.body };
}

async function setupRecycler(over = {}) {
  const recycler = await makeRecycler(over);
  const password = "password";
  const account = await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email: `${recycler.id}@example.com`, passwordHash: await hashPassword(password) },
  });
  const app = createApp();
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email: account.email, password });
  return { recycler, account, agent, app };
}

describe("admin auth", () => {
  beforeEach(() => truncateAll());

  it("an admin account can log in and gets role: ADMIN back (used to throw — recyclerId is null)", async () => {
    const { loginBody } = await setupAdmin();
    expect(loginBody.role).toBe("ADMIN");
    expect(loginBody.recycler_id).toBeNull();
  });

  it("GET /admin/flags requires a session", async () => {
    const app = createApp();
    const res = await request(app).get("/admin/flags");
    expect(res.status).toBe(401);
  });

  it("GET /admin/flags is forbidden for a non-admin (recycler) session", async () => {
    const { agent } = await setupRecycler();
    const res = await agent.get("/admin/flags");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("GET /admin/recyclers is also forbidden for a non-admin session", async () => {
    const { agent } = await setupRecycler();
    const res = await agent.get("/admin/recyclers");
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/flags", () => {
  beforeEach(() => truncateAll());

  it("returns an empty ranked queue with no flags", async () => {
    const { agent } = await setupAdmin();
    const res = await agent.get("/admin/flags");
    expect(res.status).toBe(200);
    expect(res.body.flags).toEqual([]);
  });

  it("sees flags across MULTIPLE recyclers (cross-tenant, unlike GET /recycler/flags)", async () => {
    const { agent } = await setupAdmin();
    const recyclerA = await makeRecycler({ name: "Recycler A" });
    const recyclerB = await makeRecycler({ name: "Recycler B", registrationNo: "REG-B-1" });

    await prisma.anomalyFlag.create({
      data: { subjectType: "RECYCLER", subjectId: recyclerA.id, detectorCode: "ML_FLAG_RATE", severity: "WARN", detail: { total: 10, flagged: 3, rate: 0.3, threshold: 0.2 } },
    });
    await prisma.anomalyFlag.create({
      data: { subjectType: "RECYCLER", subjectId: recyclerB.id, detectorCode: "ML_FLAG_RATE", severity: "CRITICAL", detail: { total: 20, flagged: 18, rate: 0.9, threshold: 0.2 } },
    });

    const res = await agent.get("/admin/flags");
    expect(res.status).toBe(200);
    expect(res.body.flags).toHaveLength(2);
    const subjectIds = res.body.flags.map((f) => f.subject_id);
    expect(subjectIds).toContain(recyclerA.id);
    expect(subjectIds).toContain(recyclerB.id);
  });

  it("ranks a CRITICAL flag above a WARN flag when value-at-stake is comparable", async () => {
    const { agent } = await setupAdmin();
    const recyclerWarn = await makeRecycler({ name: "Warn Recycler" });
    const recyclerCritical = await makeRecycler({ name: "Critical Recycler", registrationNo: "REG-C-1" });

    await prisma.anomalyFlag.create({
      data: { subjectType: "RECYCLER", subjectId: recyclerWarn.id, detectorCode: "ML_FLAG_RATE", severity: "WARN", detail: { total: 10, flagged: 3, rate: 0.3, threshold: 0.2 } },
    });
    await prisma.anomalyFlag.create({
      data: { subjectType: "RECYCLER", subjectId: recyclerCritical.id, detectorCode: "ML_FLAG_RATE", severity: "CRITICAL", detail: { total: 10, flagged: 3, rate: 0.3, threshold: 0.2 } },
    });

    const res = await agent.get("/admin/flags");
    expect(res.status).toBe(200);
    expect(res.body.flags[0].severity).toBe("CRITICAL");
    expect(res.body.flags[0].priority).toBeGreaterThan(res.body.flags[1].priority);
  });

  it("marks a party with no ML_FLAG_RATE history as insufficient, not clean", async () => {
    const { agent } = await setupAdmin();
    const recycler = await makeRecycler();
    const category = await makeCategory();
    const collector = await makeCollector();
    const lot = await makeLot({ categoryId: category.id, collectorId: collector.id });
    const handover = await makeHandover({ lotId: lot.id, recyclerId: recycler.id });

    // A HANDOVER-subject flag on a recycler who has no ML_FLAG_RATE history yet.
    await prisma.anomalyFlag.create({
      data: {
        subjectType: "HANDOVER", subjectId: handover.id, detectorCode: "ML_PRICE_ANOMALY", severity: "WARN",
        detail: { recycler_id: recycler.id, reference_price: 200, final_price_per_kg: 90, buyer_offer_per_kg: 190 },
      },
    });

    const res = await agent.get("/admin/flags");
    expect(res.status).toBe(200);
    expect(res.body.flags).toHaveLength(1);
    expect(res.body.flags[0].history).toBe("insufficient");
  });

  it("rejects an invalid severity filter", async () => {
    const { agent } = await setupAdmin();
    const res = await agent.get("/admin/flags?severity=NOPE");
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/flags/:id", () => {
  beforeEach(() => truncateAll());

  it("404s for an unknown id", async () => {
    const { agent } = await setupAdmin();
    const res = await agent.get("/admin/flags/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /admin/flags/:id", () => {
  beforeEach(() => truncateAll());

  it("rejects an admin_outcome outside the CHECK vocabulary", async () => {
    const { agent } = await setupAdmin();
    const recycler = await makeRecycler();
    const flag = await prisma.anomalyFlag.create({
      data: { subjectType: "RECYCLER", subjectId: recycler.id, detectorCode: "ML_FLAG_RATE", severity: "WARN", detail: {} },
    });

    const res = await agent.patch(`/admin/flags/${flag.id}`).send({ admin_outcome: "MADE_UP" });
    expect(res.status).toBe(400);
  });

  it("writes admin_outcome and resolves the flag", async () => {
    const { agent } = await setupAdmin();
    const recycler = await makeRecycler();
    const flag = await prisma.anomalyFlag.create({
      data: { subjectType: "RECYCLER", subjectId: recycler.id, detectorCode: "ML_FLAG_RATE", severity: "WARN", detail: {} },
    });

    const res = await agent.patch(`/admin/flags/${flag.id}`).send({ admin_outcome: "SUSPICIOUS" });
    expect(res.status).toBe(200);
    expect(res.body.admin_outcome).toBe("SUSPICIOUS");
    expect(res.body.resolved_at).not.toBeNull();

    const updated = await prisma.anomalyFlag.findUnique({ where: { id: flag.id } });
    expect(updated.adminOutcome).toBe("SUSPICIOUS");
    expect(updated.resolvedAt).not.toBeNull();
  });

  it("a non-admin session cannot record an outcome", async () => {
    const { agent } = await setupRecycler();
    const recycler = await makeRecycler({ name: "Other", registrationNo: "REG-OTHER-1" });
    const flag = await prisma.anomalyFlag.create({
      data: { subjectType: "RECYCLER", subjectId: recycler.id, detectorCode: "ML_FLAG_RATE", severity: "WARN", detail: {} },
    });
    const res = await agent.patch(`/admin/flags/${flag.id}`).send({ admin_outcome: "JUSTIFIED" });
    expect(res.status).toBe(403);
  });
});
