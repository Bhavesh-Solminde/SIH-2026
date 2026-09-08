import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeRecycler } from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";

afterAll(() => prisma.$disconnect());

async function makeAccount({ password = "correct-horse-battery" } = {}) {
  const recycler = await makeRecycler();
  const passwordHash = await hashPassword(password);
  const account = await prisma.recyclerAccount.create({
    data: {
      recyclerId: recycler.id,
      email: "test@example.com",
      passwordHash,
    },
  });
  return { recycler, account, password };
}

describe("POST /auth/login", () => {
  beforeEach(() => truncateAll());

  it("happy path — returns recycler info and sets session cookie", async () => {
    const { recycler, account, password } = await makeAccount();
    const app = createApp();

    const res = await request(app)
      .post("/auth/login")
      .send({ email: account.email, password });

    expect(res.status).toBe(200);
    expect(res.body.recycler_id).toBe(recycler.id);
    expect(res.body.name).toBe(recycler.name);
    expect(res.body.email).toBe(account.email);

    // Cookie must be set
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c) => c.startsWith("bhaav_session="))).toBe(true);

    // Session row must exist in DB
    const sessions = await prisma.recyclerSession.findMany({
      where: { accountId: account.id },
    });
    expect(sessions.length).toBe(1);
    expect(sessions[0].expiresAt > new Date()).toBe(true);
  });

  it("wrong password → 401", async () => {
    const { account } = await makeAccount();
    const res = await request(createApp())
      .post("/auth/login")
      .send({ email: account.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("unknown email → 401 (same response, no enumeration)", async () => {
    await makeAccount();
    const res = await request(createApp())
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "any-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("missing fields → 400", async () => {
    const res = await request(createApp())
      .post("/auth/login")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  beforeEach(() => truncateAll());

  it("no cookie → 401", async () => {
    const res = await request(createApp()).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("valid session → returns recycler info", async () => {
    const { recycler, account, password } = await makeAccount();
    const agent = request.agent(createApp());

    // Login to get cookie
    await agent
      .post("/auth/login")
      .send({ email: account.email, password });

    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(recycler.id);
    expect(res.body.email).toBe(account.email);
  });

  it("invalid/random token → 401", async () => {
    const res = await request(createApp())
      .get("/auth/me")
      .set("Cookie", "bhaav_session=notarealtoken");
    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me — mpcbVerified badge", () => {
  beforeEach(() => truncateAll());

  async function loginAs(recyclerOverrides) {
    const recycler = await makeRecycler(recyclerOverrides);
    const passwordHash = await hashPassword("secret");
    const account = await prisma.recyclerAccount.create({
      data: { recyclerId: recycler.id, email: `r-${recycler.id.slice(0, 8)}@example.com`, passwordHash },
    });
    const agent = request.agent(createApp());
    await agent.post("/auth/login").send({ email: account.email, password: "secret" });
    return agent;
  }

  it("true for a VALID, non-revoked recycler", async () => {
    const agent = await loginAs({ authorizationStatus: "VALID", trustBadgeRevoked: false });
    const res = await agent.get("/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.mpcbVerified).toBe(true);
  });

  it("false when authorizationStatus is LAPSED_IN_LIST, even if not revoked", async () => {
    const agent = await loginAs({ authorizationStatus: "LAPSED_IN_LIST", trustBadgeRevoked: false });
    const res = await agent.get("/auth/me");
    expect(res.body.mpcbVerified).toBe(false);
  });

  it("false when an admin has revoked the badge, even though VALID", async () => {
    const agent = await loginAs({ authorizationStatus: "VALID", trustBadgeRevoked: true });
    const res = await agent.get("/auth/me");
    expect(res.body.mpcbVerified).toBe(false);
  });

  it("is null (not false) for an admin session — no recycler to have a badge", async () => {
    const passwordHash = await hashPassword("secret");
    const account = await prisma.recyclerAccount.create({
      data: { recyclerId: null, email: "admin-badge@example.com", passwordHash, role: "ADMIN" },
    });
    const agent = request.agent(createApp());
    await agent.post("/auth/login").send({ email: account.email, password: "secret" });

    const res = await agent.get("/auth/me");
    expect(res.body.mpcbVerified).toBeNull();
  });
});

describe("POST /auth/logout", () => {
  beforeEach(() => truncateAll());

  it("clears cookie and deletes session row", async () => {
    const { account, password } = await makeAccount();
    const agent = request.agent(createApp());

    await agent
      .post("/auth/login")
      .send({ email: account.email, password });

    const sessionsBefore = await prisma.recyclerSession.findMany({
      where: { accountId: account.id },
    });
    expect(sessionsBefore.length).toBe(1);

    const res = await agent.post("/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const sessionsAfter = await prisma.recyclerSession.findMany({
      where: { accountId: account.id },
    });
    expect(sessionsAfter.length).toBe(0);
  });

  it("logout without a session → 200 (idempotent)", async () => {
    const res = await request(createApp()).post("/auth/logout");
    expect(res.status).toBe(200);
  });
});
