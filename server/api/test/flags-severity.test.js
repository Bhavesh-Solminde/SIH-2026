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
