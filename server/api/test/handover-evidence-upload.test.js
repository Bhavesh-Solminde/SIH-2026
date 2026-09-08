/**
 * End-to-end coverage for the handover evidence flow added alongside
 * HandoverEvidenceScreen: a real multipart POST /photos upload (kind
 * HANDOVER), exercised the same way the collector app calls it, gating
 * POST /handover/:lot_id/confirm exactly as routes/handover.js requires.
 *
 * POST /photos had no test coverage before this — the confirm-endpoint tests
 * in handover.test.js exercise the requirement via the makePhoto() fixture
 * directly against the DB, which proves the gate but not the upload route
 * that is actually supposed to satisfy it.
 *
 * DB: bhaav_test (port 5433). Serial execution. truncateAll in beforeEach.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  prisma, truncateAll, makeRecycler, makeCategory, makeCollector, makeLot,
} from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";
import { uuidv7 } from "@bhaav/core/ids";

afterAll(() => prisma.$disconnect());

async function setupFull() {
  const recycler = await makeRecycler();
  const category = await makeCategory({ code: `CAT-${uuidv7().slice(0, 6)}` });
  const collector = await makeCollector();
  const lot = await makeLot({ collectorId: collector.id, categoryId: category.id });
  const passwordHash = await hashPassword("secret");
  const account = await prisma.recyclerAccount.create({
    data: { recyclerId: recycler.id, email: `r-${uuidv7().slice(0, 6)}@example.com`, passwordHash },
  });
  await prisma.acceptance.create({
    data: {
      id: uuidv7(), lotId: lot.id, recyclerId: recycler.id,
      acceptedRate: "380.00", acceptedUnit: "KG", acceptedTs: new Date(),
      recyclerResponse: "ACKNOWLEDGED",
    },
  });
  return { account, lot };
}

async function loginAgent(app, email) {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password: "secret" });
  return agent;
}

describe("POST /photos (HANDOVER) → POST /handover/:lot_id/confirm", () => {
  beforeEach(() => truncateAll());

  it("a real multipart upload satisfies the confirm evidence check", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);

    await agent.post("/handover").send({
      lot_id: lot.id, inspected_condition: "GOOD", final_unit_price: 350,
    });

    const bytes = Buffer.from("not a real jpeg, just needs to be bytes");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const photoId = uuidv7();

    const uploadRes = await request(app)
      .post("/photos")
      .field("photoId", photoId)
      .field("lotId", lot.id)
      .field("kind", "HANDOVER")
      .field("sha256", sha256)
      .attach("file", bytes, "handover.jpg");

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.photo.kind).toBe("HANDOVER");
    expect(uploadRes.body.photo.uploaded).toBe(true);

    const confirmRes = await request(app)
      .post(`/handover/${lot.id}/confirm`)
      .send({ handoverLat: 19.076, handoverLng: 72.877 });

    expect(confirmRes.status).toBe(200);

    const row = await prisma.handover.findUnique({ where: { lotId: lot.id } });
    expect(row.status).toBe("CONFIRMED");
    expect(Number(row.handoverLat)).toBeCloseTo(19.076, 5);
    expect(Number(row.handoverLng)).toBeCloseTo(72.877, 5);
  });

  it("a declared sha256 that doesn't match the bytes is rejected and does not satisfy confirm", async () => {
    const app = createApp();
    const { account, lot } = await setupFull();
    const agent = await loginAgent(app, account.email);

    await agent.post("/handover").send({
      lot_id: lot.id, inspected_condition: "GOOD", final_unit_price: 350,
    });

    const uploadRes = await request(app)
      .post("/photos")
      .field("photoId", uuidv7())
      .field("lotId", lot.id)
      .field("kind", "HANDOVER")
      .field("sha256", "0".repeat(64)) // wrong on purpose
      .attach("file", Buffer.from("some bytes"), "handover.jpg");

    expect(uploadRes.status).toBe(400);

    const confirmRes = await request(app)
      .post(`/handover/${lot.id}/confirm`)
      .send({ handoverLat: 19.076, handoverLng: 72.877 });
    expect(confirmRes.status).toBe(400);
    expect(confirmRes.body.error).toBe("handover_photo_required");
  });
});
