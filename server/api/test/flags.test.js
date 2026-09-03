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

async function setupAuth() {
  const recycler = await makeRecycler();
  const password = "password";
  const passwordHash = await hashPassword(password);
  const account = await prisma.recyclerAccount.create({
    data: {
      recyclerId: recycler.id,
      email: "test@example.com",
      passwordHash,
    },
  });

  const app = createApp();
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email: account.email, password });
  return { recycler, agent, app };
}

describe("GET /recycler/flags", () => {
  beforeEach(() => truncateAll());

  it("requires session", async () => {
    const app = createApp();
    const res = await request(app).get("/recycler/flags");
    expect(res.status).toBe(401);
  });

  it("returns empty array when no flags", async () => {
    const { agent } = await setupAuth();
    const res = await agent.get("/recycler/flags");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns RECYCLER-subject flag for this recycler", async () => {
    const { recycler, agent } = await setupAuth();

    await prisma.anomalyFlag.create({
      data: {
        subjectType: "RECYCLER",
        subjectId: recycler.id,
        detectorCode: "TEST_RECYCLER_FLAG",
        severity: "CRITICAL",
        detail: "Test flag details",
      },
    });

    const res = await agent.get("/recycler/flags");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].subject_type).toBe("RECYCLER");
    expect(res.body[0].subject_id).toBe(recycler.id);
  });

  it("returns HANDOVER-subject flag for a handover belonging to this recycler", async () => {
    const { recycler, agent } = await setupAuth();
    const category = await makeCategory();
    const collector = await makeCollector();
    const lot = await makeLot({ categoryId: category.id, collectorId: collector.id });
    const handover = await makeHandover({ lotId: lot.id, recyclerId: recycler.id });

    await prisma.anomalyFlag.create({
      data: {
        subjectType: "HANDOVER",
        subjectId: handover.id,
        detectorCode: "TEST_HANDOVER_FLAG",
        severity: "WARN",
        detail: "Handover flag",
      },
    });

    const res = await agent.get("/recycler/flags");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].subject_type).toBe("HANDOVER");
    expect(res.body[0].subject_id).toBe(handover.id);
  });

  it("does not return flags for a different recycler's handovers", async () => {
    const { agent } = await setupAuth();
    
    // Create a DIFFERENT recycler and handover
    const otherRecycler = await makeRecycler();
    const category = await makeCategory();
    const collector = await makeCollector();
    const lot = await makeLot({ categoryId: category.id, collectorId: collector.id });
    const handover = await makeHandover({ lotId: lot.id, recyclerId: otherRecycler.id });

    await prisma.anomalyFlag.create({
      data: {
        subjectType: "HANDOVER",
        subjectId: handover.id,
        detectorCode: "OTHER_HANDOVER_FLAG",
        severity: "WARN",
        detail: "Handover flag",
      },
    });
    
    await prisma.anomalyFlag.create({
      data: {
        subjectType: "RECYCLER",
        subjectId: otherRecycler.id,
        detectorCode: "OTHER_RECYCLER_FLAG",
        severity: "CRITICAL",
        detail: "Recycler flag",
      },
    });

    const res = await agent.get("/recycler/flags");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("does not return resolved flags (resolvedAt IS NOT NULL)", async () => {
    const { recycler, agent } = await setupAuth();

    await prisma.anomalyFlag.create({
      data: {
        subjectType: "RECYCLER",
        subjectId: recycler.id,
        detectorCode: "RESOLVED_FLAG",
        severity: "INFO",
        detail: "Resolved",
        resolvedAt: new Date(),
      },
    });

    const res = await agent.get("/recycler/flags");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
