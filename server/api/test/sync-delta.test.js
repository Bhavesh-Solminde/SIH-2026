import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeCategory, makeRecycler } from "./helpers/db.js";

const app = createApp();

beforeEach(truncateAll);
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

async function publish(recyclerId, categoryId, price, validFrom) {
  return prisma.rate.create({
    data: {
      recyclerId,
      categoryId,
      unit: "KG",
      price,
      source: "RECYCLER_PUBLISHED",
      validFrom: new Date(validFrom),
    },
  });
}

describe("GET /sync/delta", () => {
  it("returns 400 when since is missing", async () => {
    const res = await request(app).get("/sync/delta");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("returns 400 when since is not a parseable date", async () => {
    const res = await request(app).get("/sync/delta?since=notadate");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("returns only recyclers whose updatedAt is after the cursor", async () => {
    // Create both recyclers first so their created/updated timestamps are before the cursor
    const unchanged = await makeRecycler({ name: "Unchanged Recycler", registrationNo: "REG-UNCHANGED" });
    const updated = await makeRecycler({ name: "Updated Recycler", registrationNo: "REG-UPDATED" });

    // Set cursor AFTER both rows exist (so their initial updated_at is before cursor)
    const cursor = new Date().toISOString();

    // Bump updated_at of just the "updated" recycler to be after the cursor
    await prisma.$executeRawUnsafe(
      `UPDATE recycler SET updated_at = now() WHERE id = '${updated.id}'`,
    );

    const res = await request(app).get(`/sync/delta?since=${cursor}`);
    expect(res.status).toBe(200);

    const ids = res.body.recyclers.map((r) => r.id);
    expect(ids).toContain(updated.id);
    expect(ids).not.toContain(unchanged.id);
  });

  it("puts lapsed recyclers in removedRecyclerIds", async () => {
    // Create the recycler first so its initial updated_at is before the cursor
    const recycler = await makeRecycler({ name: "Soon Lapsed", registrationNo: "REG-LAPSED" });

    // Set cursor after creation
    const cursor = new Date().toISOString();

    // Now lapse it — updated_at will be bumped to now (after cursor)
    await prisma.$executeRawUnsafe(
      `UPDATE recycler SET authorization_status = 'LAPSED_IN_LIST', updated_at = now() WHERE id = '${recycler.id}'`,
    );

    const res = await request(app).get(`/sync/delta?since=${cursor}`);
    expect(res.status).toBe(200);

    expect(res.body.removedRecyclerIds).toContain(recycler.id);
    const ids = res.body.recyclers.map((r) => r.id);
    expect(ids).not.toContain(recycler.id);
  });

  it("returns only rates created after the cursor", async () => {
    const cat = await makeCategory();
    // Use distinct registrationNo to avoid unique constraint collisions across tests
    const rec = await makeRecycler({ registrationNo: "REG-RATES-TEST" });

    // Insert the "old" rate first — its created_at will be before the cursor we
    // set next. The rate table is append-only (no UPDATE allowed) so we rely on
    // natural insertion order rather than back-dating.
    await publish(rec.id, cat.id, "300.00", "2026-08-30T09:00:00+05:30");

    // Cursor is set after the old rate was inserted
    const cursor = new Date().toISOString();

    // Insert the "new" rate after the cursor timestamp
    await publish(rec.id, cat.id, "420.00", "2026-09-01T09:00:00+05:30");

    const res = await request(app).get(`/sync/delta?since=${cursor}`);
    expect(res.status).toBe(200);

    // Only the newer rate (price 420) should appear
    expect(res.body.rates).toHaveLength(1);
    expect(res.body.rates[0].price).toBe(420);
  });

  it("returns serverTime as ISO-8601", async () => {
    const cursor = new Date(Date.now() - 5000).toISOString();
    const res = await request(app).get(`/sync/delta?since=${cursor}`);
    expect(res.status).toBe(200);
    const t = new Date(res.body.serverTime).getTime();
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(0);
  });
});
