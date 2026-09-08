/**
 * GET /public/rates — the collector app's price board / accept-flow feed
 * (RecyclerAuthBadge.jsx renders per row here; PriceBoardScreen.jsx and
 * AcceptScreen.jsx are the only consumers). No prior coverage existed for
 * its authorisation filtering at all.
 *
 * Written because revoking a recycler's trust badge via the admin panel
 * (PATCH /recyclers/:id/badge) had zero effect on what a collector saw —
 * this query only ever checked authorizationStatus, never
 * trustBadgeRevoked, so an admin revoke and this endpoint were completely
 * disconnected. See schema.prisma's comment on Recycler.trustBadgeRevoked.
 *
 * DB: bhaav_test (port 5433). Serial execution. truncateAll in beforeEach.
 */
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

async function publish(recyclerId, categoryId, price) {
  return prisma.rate.create({
    data: { recyclerId, categoryId, unit: "KG", price, source: "RECYCLER_PUBLISHED" },
  });
}

describe("GET /public/rates — authorisation filtering", () => {
  it("includes a VALID, non-revoked recycler", async () => {
    const cat = await makeCategory();
    const recycler = await makeRecycler({ name: "Bharat E Waste", authorizationStatus: "VALID" });
    await publish(recycler.id, cat.id, "410.00");

    const res = await request(app).get("/public/rates");
    expect(res.status).toBe(200);
    expect(res.body.rates.map((r) => r.recyclerName)).toContain("Bharat E Waste");
  });

  it("excludes a LAPSED_IN_LIST recycler (pre-existing behaviour, unchanged)", async () => {
    const cat = await makeCategory();
    const recycler = await makeRecycler({ authorizationStatus: "LAPSED_IN_LIST" });
    await publish(recycler.id, cat.id, "410.00");

    const res = await request(app).get("/public/rates");
    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(0);
  });

  it("excludes a VALID recycler whose admin-set trust badge is revoked", async () => {
    const cat = await makeCategory();
    const recycler = await makeRecycler({
      name: "Suspect Recyclers Pvt Ltd",
      authorizationStatus: "VALID",
      trustBadgeRevoked: true,
    });
    await publish(recycler.id, cat.id, "999.00");

    const res = await request(app).get("/public/rates");
    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(0);
  });

  it("a revoke does not affect a DIFFERENT recycler's rates in the same response", async () => {
    const cat = await makeCategory();
    const clean = await makeRecycler({ name: "Clean Co", authorizationStatus: "VALID" });
    const revoked = await makeRecycler({
      name: "Revoked Co", authorizationStatus: "VALID", trustBadgeRevoked: true,
    });
    await publish(clean.id, cat.id, "410.00");
    await publish(revoked.id, cat.id, "999.00");

    const res = await request(app).get("/public/rates");
    const names = res.body.rates.map((r) => r.recyclerName);
    expect(names).toContain("Clean Co");
    expect(names).not.toContain("Revoked Co");
  });

  it("restoring a revoked badge makes the recycler reappear", async () => {
    const cat = await makeCategory();
    const recycler = await makeRecycler({ authorizationStatus: "VALID", trustBadgeRevoked: true });
    await publish(recycler.id, cat.id, "410.00");

    const before = await request(app).get("/public/rates");
    expect(before.body.rates).toHaveLength(0);

    await prisma.recycler.update({ where: { id: recycler.id }, data: { trustBadgeRevoked: false } });

    const after = await request(app).get("/public/rates");
    expect(after.body.rates).toHaveLength(1);
  });
});
