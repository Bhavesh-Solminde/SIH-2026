import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeCategory, makeRecycler } from "./helpers/db.js";
import { hashPassword } from "../src/lib/password.js";
import { uuidv7 } from "@bhaav/core/ids";

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

  // Same mechanism as a lapse, but driven by the real admin endpoint rather
  // than raw SQL — exercises PATCH /recyclers/:id/badge's own updatedAt bump
  // (recyclerBadge.js), which exists specifically so this path doesn't go
  // silently unnoticed by delta sync the way a plain trustBadgeRevoked write
  // would (Recycler.updatedAt has no @updatedAt decorator in schema.prisma).
  it("puts a trust-badge-revoked recycler in removedRecyclerIds too", async () => {
    const recycler = await makeRecycler({ name: "Revoked Co", authorizationStatus: "VALID" });
    const adminAccount = await prisma.recyclerAccount.create({
      data: {
        recyclerId: null,
        email: `admin-${uuidv7().slice(0, 6)}@example.com`,
        passwordHash: await hashPassword("password"),
        role: "ADMIN",
      },
    });
    const admin = request.agent(app);
    await admin.post("/auth/login").send({ email: adminAccount.email, password: "password" });

    const cursor = new Date().toISOString();

    const patchRes = await admin.patch(`/recyclers/${recycler.id}/badge`).send({ revoked: true });
    expect(patchRes.status).toBe(200);

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

    // Use THIS PROCESS'S clock for the cursor, not a database round trip.
    //
    // An earlier version of this test pulled the cursor from `SELECT now()`
    // on the theory that `rate.created_at` is stamped server-side by
    // Postgres's own `DEFAULT CURRENT_TIMESTAMP`, and that comparing it to a
    // locally-generated timestamp would only work when the app and database
    // share a machine. That theory was wrong: Prisma evaluates
    // `@default(now())` client-side and sends the value as an explicit INSERT
    // parameter, so `created_at` is stamped by the Node process's clock
    // regardless of the column's DB-level default — confirmed by logging the
    // literal SQL Prisma sends (`INSERT INTO "rate" (..., created_at) VALUES
    // (..., $7)` with `$7` bound to a JS-computed timestamp). Meanwhile the
    // route's cursor (`serverTime` in loadSnapshot(), which a real device
    // echoes back on the next call) is also `new Date().toISOString()` on
    // this same process. So the two values that must be compared already
    // share one clock; fetching the cursor from the remote database's own
    // clock instead introduced a real skew between two different machines,
    // which intermittently placed a just-created row's created_at before the
    // cursor and made the delta come back empty. Proof (captured from a
    // failing run): cursor from `SELECT now()` = 2026-09-06T15:17:01.415Z,
    // while the new row's created_at (the literal $7 Prisma bound) =
    // 2026-09-06T15:17:01.411Z — 4ms *earlier* than a cursor taken *after*
    // the row was inserted, on a remote (Supabase ap-south-1) database.
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
