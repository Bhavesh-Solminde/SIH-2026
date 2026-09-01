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

async function setupFull() {
  const recycler = await makeRecycler();
  const category = await makeCategory({ code: "PCB" });
  const collector = await makeCollector();
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id });

  const passwordHash = await hashPassword("secret");
  const account = await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email: "acc@example.com", passwordHash },
  });

  const acceptance = await prisma.acceptance.create({
    data: {
      id: uuidv7(),
      lotId: lot.id,
      recyclerId: recycler.id,
      acceptedRate: "380.00",
      acceptedUnit: "KG",
      acceptedTs: new Date(),
    },
  });

  return { recycler, account, lot, acceptance, category, collector };
}

async function loginAgent(app, email = "acc@example.com", password = "secret") {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password });
  return agent;
}

describe("GET /recycler/acceptances", () => {
  beforeEach(() => truncateAll());

  it("lists pending (NONE) acceptances with lot and pseudonymous collector", async () => {
    const app = createApp();
    const { acceptance, lot, category, collector } = await setupFull();
    const agent = await loginAgent(app);

    const res = await agent.get("/recycler/acceptances");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);

    const a = res.body[0];
    expect(a.id).toBe(acceptance.id);
    expect(a.lot_id).toBe(lot.id);
    expect(a.lot.category.code).toBe(category.code);

    // Collector is pseudonymous
    expect(a.lot.collector.pseudonym).toBe(collector.id.slice(0, 8));
    expect(a.lot.collector.pseudonym).not.toBe(collector.id);
  });

  it("does not list already-responded acceptances", async () => {
    const app = createApp();
    const { acceptance } = await setupFull();
    const agent = await loginAgent(app);

    // Respond first
    await agent
      .post(`/recycler/acceptances/${acceptance.id}/respond`)
      .send({ action: "ACCEPT" });

    const res = await agent.get("/recycler/acceptances");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it("returns 401 without session", async () => {
    const res = await request(createApp()).get("/recycler/acceptances");
    expect(res.status).toBe(401);
  });
});

describe("POST /recycler/acceptances/:id/respond", () => {
  beforeEach(() => truncateAll());

  it("ACCEPT sets recyclerResponse to ACKNOWLEDGED", async () => {
    const app = createApp();
    const { acceptance } = await setupFull();
    const agent = await loginAgent(app);

    const res = await agent
      .post(`/recycler/acceptances/${acceptance.id}/respond`)
      .send({ action: "ACCEPT" });

    expect(res.status).toBe(200);
    expect(res.body.recycler_response).toBe("ACKNOWLEDGED");
    expect(res.body.response_ts).toBeTruthy();

    const row = await prisma.acceptance.findUnique({ where: { id: acceptance.id } });
    expect(row.recyclerResponse).toBe("ACKNOWLEDGED");
    expect(row.responseTs).not.toBeNull();
  });

  it("REJECT sets recyclerResponse to DECLINED", async () => {
    const app = createApp();
    const { acceptance } = await setupFull();
    const agent = await loginAgent(app);

    const res = await agent
      .post(`/recycler/acceptances/${acceptance.id}/respond`)
      .send({ action: "REJECT" });

    expect(res.status).toBe(200);
    expect(res.body.recycler_response).toBe("DECLINED");

    const row = await prisma.acceptance.findUnique({ where: { id: acceptance.id } });
    expect(row.recyclerResponse).toBe("DECLINED");
  });

  it("invalid action → 400", async () => {
    const app = createApp();
    const { acceptance } = await setupFull();
    const agent = await loginAgent(app);

    const res = await agent
      .post(`/recycler/acceptances/${acceptance.id}/respond`)
      .send({ action: "MAYBE" });

    expect(res.status).toBe(400);
  });

  it("double-respond → 409 conflict", async () => {
    const app = createApp();
    const { acceptance } = await setupFull();
    const agent = await loginAgent(app);

    await agent
      .post(`/recycler/acceptances/${acceptance.id}/respond`)
      .send({ action: "ACCEPT" });

    const res = await agent
      .post(`/recycler/acceptances/${acceptance.id}/respond`)
      .send({ action: "REJECT" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("already_responded");
  });

  it("unknown id → 404", async () => {
    const app = createApp();
    await setupFull();
    const agent = await loginAgent(app);

    const res = await agent
      .post(`/recycler/acceptances/${uuidv7()}/respond`)
      .send({ action: "ACCEPT" });

    expect(res.status).toBe(404);
  });

  it("requires session — 401 without cookie", async () => {
    const { acceptance } = await setupFull();
    const res = await request(createApp())
      .post(`/recycler/acceptances/${acceptance.id}/respond`)
      .send({ action: "ACCEPT" });
    expect(res.status).toBe(401);
  });
});
