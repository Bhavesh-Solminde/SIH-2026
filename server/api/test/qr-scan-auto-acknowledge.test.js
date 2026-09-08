/**
 * Scanning the collector's QR code (GET /lots/:reference_code) is now the
 * recycler's acknowledgment — a recycler does not scan a lot they have no
 * intention of inspecting, so requiring a separate trip to the Incoming
 * queue to tap Accept first was a redundant step. See
 * server/api/src/lib/acceptanceResponse.js, shared with the explicit
 * POST /recycler/acceptances/:id/respond path this replicates.
 *
 * DB: bhaav_test (port 5433). Serial execution. truncateAll in beforeEach.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7, referenceCodeFromUuid } from "@bhaav/core/ids";

const sendSmsMock = vi.fn();
const smsEnabledMock = vi.fn();

vi.mock("../src/lib/sms.js", () => ({
  sendSms: (...args) => sendSmsMock(...args),
  smsEnabled: (...args) => smsEnabledMock(...args),
}));

const { createApp } = await import("../src/app.js");
const {
  prisma, truncateAll, makeRecycler, makeCategory, makeCollector, makeLot,
} = await import("./helpers/db.js");
const { hashPassword } = await import("../src/lib/password.js");

afterAll(() => prisma.$disconnect());

async function setup() {
  const recycler = await makeRecycler();
  const category = await makeCategory();
  const collector = await makeCollector();
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id });

  const passwordHash = await hashPassword("secret");
  const account = await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email: `r-${uuidv7().slice(0, 6)}@example.com`, passwordHash },
  });
  const acceptance = await prisma.acceptance.create({
    data: {
      id: uuidv7(), lotId: lot.id, recyclerId: recycler.id,
      acceptedRate: "65.00", acceptedUnit: "KG", acceptedTs: new Date(),
    },
  });

  return { recycler, account, lot, acceptance };
}

async function loginAgent(app, email) {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password: "secret" });
  return agent;
}

describe("GET /lots/:reference_code — auto-acknowledge on scan", () => {
  beforeEach(async () => {
    await truncateAll();
    sendSmsMock.mockReset().mockResolvedValue({ ok: true, body: {} });
    smsEnabledMock.mockReset().mockReturnValue(false);
  });

  it("acknowledges this recycler's NONE acceptance and returns acknowledged: true", async () => {
    const app = createApp();
    const { account, lot, recycler } = await setup();
    const agent = await loginAgent(app, account.email);
    const refCode = referenceCodeFromUuid(lot.id);

    const res = await agent.get(`/lots/${refCode}`);
    expect(res.status).toBe(200);
    expect(res.body.acknowledged).toBe(true);

    const row = await prisma.acceptance.findFirst({ where: { lotId: lot.id, recyclerId: recycler.id } });
    expect(row.recyclerResponse).toBe("ACKNOWLEDGED");
    expect(row.responseTs).not.toBeNull();

    const updatedLot = await prisma.lot.findUnique({ where: { id: lot.id } });
    expect(updatedLot.status).toBe("ACCEPTED");
  });

  it("is idempotent — scanning twice does not error, and the second scan reports acknowledged: false", async () => {
    const app = createApp();
    const { account, lot } = await setup();
    const agent = await loginAgent(app, account.email);
    const refCode = referenceCodeFromUuid(lot.id);

    const first = await agent.get(`/lots/${refCode}`);
    expect(first.body.acknowledged).toBe(true);

    const second = await agent.get(`/lots/${refCode}`);
    expect(second.status).toBe(200);
    expect(second.body.acknowledged).toBe(false);
  });

  it("an anonymous scan (no session) still resolves the lot and does not acknowledge anything", async () => {
    const app = createApp();
    const { lot, recycler } = await setup();
    const refCode = referenceCodeFromUuid(lot.id);

    const res = await request(app).get(`/lots/${refCode}`);
    expect(res.status).toBe(200);
    expect(res.body.acknowledged).toBe(false);

    const row = await prisma.acceptance.findFirst({ where: { lotId: lot.id, recyclerId: recycler.id } });
    expect(row.recyclerResponse).toBe("NONE");
  });

  it("does not acknowledge a DIFFERENT recycler's acceptance on the same lot", async () => {
    const app = createApp();
    const { lot } = await setup(); // recyclerA's NONE acceptance
    const category = await makeCategory({ code: `X${uuidv7().slice(0, 5)}` });
    const recyclerB = await makeRecycler();
    const passwordHash = await hashPassword("secret");
    const accountB = await prisma.recyclerAccount.create({
      data: { recyclerId: recyclerB.id, email: `b-${uuidv7().slice(0, 6)}@example.com`, passwordHash },
    });
    // recyclerB has no acceptance on this lot at all.

    const agentB = await loginAgent(app, accountB.email);
    const refCode = referenceCodeFromUuid(lot.id);

    const res = await agentB.get(`/lots/${refCode}`);
    expect(res.status).toBe(200);
    expect(res.body.acknowledged).toBe(false);

    // recyclerA's row is untouched
    const rowA = await prisma.acceptance.findFirst({ where: { lotId: lot.id } });
    expect(rowA.recyclerResponse).toBe("NONE");
  });

  it("does not acknowledge once a handover already exists for the lot", async () => {
    const app = createApp();
    const { account, lot, recycler } = await setup();
    const agent = await loginAgent(app, account.email);
    const refCode = referenceCodeFromUuid(lot.id);

    // First scan acknowledges normally.
    await agent.get(`/lots/${refCode}`);
    // Recycler proceeds to Verify & Sign.
    await agent.post("/handover").send({
      lot_id: lot.id, inspected_condition: "GOOD", final_unit_price: 65,
    });

    // A later re-scan (e.g. reloading /verify?ref=…) must not error or
    // re-fire the acknowledge side effect — Phase A of the route (handover
    // already exists) returns immediately and never reaches Phase B.
    const res = await agent.get(`/lots/${refCode}`);
    expect(res.status).toBe(200);
    expect(res.body.handover_status).toBe("PENDING_COLLECTOR");
    expect(res.body.acknowledged).toBeUndefined();
  });
});
