/**
 * Tests for the admin-only "MPCB verified" trust badge controls:
 *   GET   /recyclers/verified     — list MPCB-VALID recyclers + badge state
 *   PATCH /recyclers/:id/badge    — revoke/restore, independent of
 *                                   authorizationStatus (only mpcb-refresh.js
 *                                   touches that column)
 *
 * DB: bhaav_test (port 5433). Serial execution. truncateAll in beforeEach.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeRecycler } from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";
import { uuidv7 } from "@bhaav/core/ids";

afterAll(() => prisma.$disconnect());

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

async function setupRecycler(app, over = {}) {
  const recycler = await makeRecycler(over);
  const account = await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email: `r-${uuidv7().slice(0, 6)}@example.com`, passwordHash: await hashPassword("secret") },
  });
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email: account.email, password: "secret" });
  return { recycler, agent };
}

describe("GET /recyclers/verified", () => {
  beforeEach(() => truncateAll());

  it("401 — requires a session", async () => {
    const res = await request(createApp()).get("/recyclers/verified");
    expect(res.status).toBe(401);
  });

  it("403 — a recycler session is not enough, must be ADMIN", async () => {
    const app = createApp();
    const { agent } = await setupRecycler(app);
    const res = await agent.get("/recyclers/verified");
    expect(res.status).toBe(403);
  });

  it("200 — lists only MPCB-VALID recyclers, with badge_revoked state", async () => {
    const app = createApp();
    await makeRecycler({ name: "Valid Co", authorizationStatus: "VALID", trustBadgeRevoked: false });
    await makeRecycler({ name: "Revoked Co", authorizationStatus: "VALID", trustBadgeRevoked: true });
    await makeRecycler({ name: "Lapsed Co", authorizationStatus: "LAPSED_IN_LIST" });

    const admin = await setupAdmin(app);
    const res = await admin.get("/recyclers/verified");

    expect(res.status).toBe(200);
    const names = res.body.recyclers.map((r) => r.name).sort();
    expect(names).toEqual(["Revoked Co", "Valid Co"]); // Lapsed Co excluded

    const revoked = res.body.recyclers.find((r) => r.name === "Revoked Co");
    expect(revoked.badge_revoked).toBe(true);
    const valid = res.body.recyclers.find((r) => r.name === "Valid Co");
    expect(valid.badge_revoked).toBe(false);
  });
});

describe("PATCH /recyclers/:id/badge", () => {
  beforeEach(() => truncateAll());

  it("200 — revokes the badge", async () => {
    const app = createApp();
    const recycler = await makeRecycler({ authorizationStatus: "VALID", trustBadgeRevoked: false });
    const admin = await setupAdmin(app);

    const res = await admin.patch(`/recyclers/${recycler.id}/badge`).send({ revoked: true });
    expect(res.status).toBe(200);
    expect(res.body.badge_revoked).toBe(true);

    const row = await prisma.recycler.findUnique({ where: { id: recycler.id } });
    expect(row.trustBadgeRevoked).toBe(true);
  });

  it("200 — restores a previously revoked badge", async () => {
    const app = createApp();
    const recycler = await makeRecycler({ authorizationStatus: "VALID", trustBadgeRevoked: true });
    const admin = await setupAdmin(app);

    const res = await admin.patch(`/recyclers/${recycler.id}/badge`).send({ revoked: false });
    expect(res.status).toBe(200);
    expect(res.body.badge_revoked).toBe(false);
  });

  it("does not touch authorizationStatus — only mpcb-refresh.js may", async () => {
    const app = createApp();
    const recycler = await makeRecycler({ authorizationStatus: "VALID", trustBadgeRevoked: false });
    const admin = await setupAdmin(app);

    await admin.patch(`/recyclers/${recycler.id}/badge`).send({ revoked: true });

    const row = await prisma.recycler.findUnique({ where: { id: recycler.id } });
    expect(row.authorizationStatus).toBe("VALID");
  });

  it("400 — revoked must be a boolean", async () => {
    const app = createApp();
    const recycler = await makeRecycler();
    const admin = await setupAdmin(app);

    const res = await admin.patch(`/recyclers/${recycler.id}/badge`).send({ revoked: "yes" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("revoked_must_be_boolean");
  });

  it("404 — unknown recycler id", async () => {
    const app = createApp();
    const admin = await setupAdmin(app);
    const res = await admin.patch(`/recyclers/${uuidv7()}/badge`).send({ revoked: true });
    expect(res.status).toBe(404);
  });

  it("403 — a recycler session cannot revoke anyone's badge, including their own", async () => {
    const app = createApp();
    const { recycler, agent } = await setupRecycler(app, { authorizationStatus: "VALID" });
    const res = await agent.patch(`/recyclers/${recycler.id}/badge`).send({ revoked: true });
    expect(res.status).toBe(403);
  });

  it("takes effect on /auth/me immediately — revoking flips the badge on the next check", async () => {
    const app = createApp();
    const { recycler, agent } = await setupRecycler(app, { authorizationStatus: "VALID", trustBadgeRevoked: false });

    const before = await agent.get("/auth/me");
    expect(before.body.mpcbVerified).toBe(true);

    const admin = await setupAdmin(app);
    await admin.patch(`/recyclers/${recycler.id}/badge`).send({ revoked: true });

    const after = await agent.get("/auth/me");
    expect(after.body.mpcbVerified).toBe(false);
  });
});
