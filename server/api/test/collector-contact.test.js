// Optional collector contact — POST/DELETE /public/collector/:id/contact,
// plus the collector-facing SMS a recycler's accept/decline fires.
//
// SAFETY: server/api seeds 161 real recycler businesses from the MPCB public
// register, 155 with real phone numbers. This suite mocks the sms module
// itself (vi.mock below) rather than relying on SMS_ENABLED defaulting to
// false, so no test here is CAPABLE of reaching fast2sms.com regardless of
// env — the real sendSms/smsEnabled implementations never run in this file.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { uuidv7 } from "@bhaav/core/ids";

const sendSmsMock = vi.fn();
const smsEnabledMock = vi.fn();

vi.mock("../src/lib/sms.js", () => ({
  sendSms: (...args) => sendSmsMock(...args),
  smsEnabled: (...args) => smsEnabledMock(...args),
}));

const { createApp } = await import("../src/app.js");
const {
  prisma,
  truncateAll,
  makeCollector,
  makeRecycler,
  makeCategory,
  makeLot,
} = await import("./helpers/db.js");
const { hashPassword } = await import("../src/lib/password.js");

afterAll(() => prisma.$disconnect());

async function loginAgent(app, email, password = "secret") {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password });
  return agent;
}

async function setupAcceptance() {
  const recycler = await makeRecycler({ name: "Waliv Metals" });
  const category = await makeCategory({ code: "CABLE" });
  const collector = await makeCollector();
  const lot = await makeLot({
    collectorId: collector.id,
    categoryId: category.id,
    unit: "KG",
    quantity: "12.000",
  });

  const email = `acc-${uuidv7()}@example.com`;
  const passwordHash = await hashPassword("secret");
  await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email, passwordHash },
  });

  const acceptance = await prisma.acceptance.create({
    data: {
      id: uuidv7(),
      lotId: lot.id,
      recyclerId: recycler.id,
      acceptedRate: "100.00",
      acceptedUnit: "KG",
      acceptedTs: new Date(),
      recyclerResponse: "NONE",
    },
  });

  return { recycler, category, collector, lot, acceptance, email };
}

describe("POST /public/collector/:id/contact", () => {
  beforeEach(() => truncateAll());

  it("stores a number with a consent timestamp when a collector opts in", async () => {
    const app = createApp();
    const collector = await makeCollector();

    const res = await request(app)
      .post(`/public/collector/${collector.id}/contact`)
      .send({ phone: "9876543210" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    const row = await prisma.collectorContact.findUnique({ where: { collectorId: collector.id } });
    expect(row).not.toBeNull();
    expect(row.phone).toBe("9876543210");
    expect(row.consentTs).toBeInstanceOf(Date);
  });

  it("rejects a phone that is not ten digits", async () => {
    const app = createApp();
    const collector = await makeCollector();

    const res = await request(app)
      .post(`/public/collector/${collector.id}/contact`)
      .send({ phone: "12345" });

    expect(res.status).toBe(400);

    const row = await prisma.collectorContact.findUnique({ where: { collectorId: collector.id } });
    expect(row).toBeNull();
  });
});

describe("DELETE /public/collector/:id/contact", () => {
  beforeEach(() => truncateAll());

  it("deletes the number on request — the DPDP erasure right, in one statement", async () => {
    const app = createApp();
    const collector = await makeCollector();
    await request(app)
      .post(`/public/collector/${collector.id}/contact`)
      .send({ phone: "9876543210" });

    const res = await request(app).delete(`/public/collector/${collector.id}/contact`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const row = await prisma.collectorContact.findUnique({ where: { collectorId: collector.id } });
    expect(row).toBeNull();
  });

  it("deleting a number that was never given succeeds anyway (idempotent)", async () => {
    const app = createApp();
    const collector = await makeCollector();

    const res = await request(app).delete(`/public/collector/${collector.id}/contact`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("succeeds even for a collector id that was never created", async () => {
    const app = createApp();

    const res = await request(app).delete(`/public/collector/${uuidv7()}/contact`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("the collector table's column count", () => {
  beforeEach(() => truncateAll());

  it("keeps the collector table at four columns — the number lives in a separate table", async () => {
    const columns = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'collector'
    `;
    const names = columns.map((c) => c.column_name);
    expect(names).not.toContain("phone");
    expect(names.sort()).toEqual(
      ["created_at", "id", "operating_area", "preferred_language"].sort(),
    );
  });
});

describe("collector notification on recycler accept/decline", () => {
  beforeEach(async () => {
    await truncateAll();
    sendSmsMock.mockReset();
    smsEnabledMock.mockReset();
    sendSmsMock.mockResolvedValue({ ok: true, body: {} });
    smsEnabledMock.mockReturnValue(true);
  });

  it("notifies the collector when a recycler accepts, and sends nothing when no contact row exists", async () => {
    const app = createApp();
    const { collector, acceptance, email } = await setupAcceptance();
    const agent = await loginAgent(app, email);

    // No contact row created for this collector.
    const res = await agent.post(`/recycler/acceptances/${acceptance.id}/respond`).send({ action: "ACCEPT" });

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("sends a confirmation SMS to the collector's contact when the recycler accepts", async () => {
    const app = createApp();
    const { collector, acceptance, email, recycler } = await setupAcceptance();
    await request(app)
      .post(`/public/collector/${collector.id}/contact`)
      .send({ phone: "9123456780" });

    const agent = await loginAgent(app, email);
    const res = await agent.post(`/recycler/acceptances/${acceptance.id}/respond`).send({ action: "ACCEPT" });

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [{ numbers, message }] = sendSmsMock.mock.calls[0];
    expect(numbers).toBe("9123456780");
    expect(message).toContain(recycler.name);
    expect(message).toContain("CABLE");
    expect(message).toContain("confirmed");
    expect(message).toContain("expecting you");
  });

  it("sends a decline SMS to the collector's contact when the recycler rejects", async () => {
    const app = createApp();
    const { collector, acceptance, email, recycler } = await setupAcceptance();
    await request(app)
      .post(`/public/collector/${collector.id}/contact`)
      .send({ phone: "9123456780" });

    const agent = await loginAgent(app, email);
    const res = await agent.post(`/recycler/acceptances/${acceptance.id}/respond`).send({ action: "REJECT" });

    expect(res.status).toBe(200);
    await new Promise((r) => setImmediate(r));

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const [{ numbers, message }] = sendSmsMock.mock.calls[0];
    expect(numbers).toBe("9123456780");
    expect(message).toContain(recycler.name);
    expect(message).toContain("declined");
  });

  it("the recycler's response still succeeds when the SMS send rejects (fail-open)", async () => {
    sendSmsMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const app = createApp();
    const { collector, acceptance, email } = await setupAcceptance();
    await request(app)
      .post(`/public/collector/${collector.id}/contact`)
      .send({ phone: "9123456780" });

    const agent = await loginAgent(app, email);
    const res = await agent.post(`/recycler/acceptances/${acceptance.id}/respond`).send({ action: "ACCEPT" });

    expect(res.status).toBe(200);
    expect(res.body.recycler_response).toBe("ACKNOWLEDGED");

    // Let the rejected promise's .catch() run so it can't surface as an
    // unhandled rejection later in the suite.
    await new Promise((r) => setImmediate(r));
  });
});
