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

describe("GET /sync/bootstrap", () => {
  it("returns only recyclers whose authorisation is currently VALID", async () => {
    const cat = await makeCategory();
    const valid = await makeRecycler({ name: "Bharat E Waste" });
    const lapsed = await makeRecycler({
      name: "Eco-Recycling Ltd",
      authorizationStatus: "LAPSED_IN_LIST",
    });
    await publish(valid.id, cat.id, "420.00", "2026-09-01T09:00:00+05:30");
    await publish(lapsed.id, cat.id, "999.00", "2026-09-01T09:00:00+05:30");

    const res = await request(app).get("/sync/bootstrap");
    expect(res.status).toBe(200);
    expect(res.body.recyclers.map((r) => r.name)).toEqual(["Bharat E Waste"]);
  });

  it("returns one rate per recycler and category — the newest", async () => {
    const cat = await makeCategory();
    const rec = await makeRecycler();
    await publish(rec.id, cat.id, "300.00", "2026-08-30T09:00:00+05:30");
    await publish(rec.id, cat.id, "420.00", "2026-09-01T09:00:00+05:30");

    const res = await request(app).get("/sync/bootstrap");
    expect(res.body.rates).toHaveLength(1);
    expect(res.body.rates[0]).toMatchObject({ categoryCode: "PCB", unit: "KG", price: 420 });
  });

  it("omits rates belonging to a lapsed recycler", async () => {
    const cat = await makeCategory();
    const lapsed = await makeRecycler({ authorizationStatus: "LAPSED_IN_LIST" });
    await publish(lapsed.id, cat.id, "999.00", "2026-09-01T09:00:00+05:30");

    const res = await request(app).get("/sync/bootstrap");
    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(0);
  });

  it("stamps serverTime so the device can call /sync/delta from a known point", async () => {
    const res = await request(app).get("/sync/bootstrap");
    expect(new Date(res.body.serverTime).getTime()).toBeGreaterThan(0);
  });

  it("returns prices as numbers, not Decimal strings", async () => {
    const cat = await makeCategory();
    const rec = await makeRecycler();
    await publish(rec.id, cat.id, "420.50", "2026-09-01T09:00:00+05:30");
    const res = await request(app).get("/sync/bootstrap");
    expect(res.body.rates[0].price).toBe(420.5);
  });

  it("returns conditionFactors as a {condition: factor} map with numeric values", async () => {
    const res = await request(app).get("/sync/bootstrap");
    expect(res.status).toBe(200);
    // conditionFactor rows are seeded; just verify the shape and numeric type.
    const { conditionFactors } = res.body;
    expect(typeof conditionFactors).toBe("object");
    for (const [, v] of Object.entries(conditionFactors)) {
      expect(typeof v).toBe("number");
    }
  });

  it("returns categories with correct fields", async () => {
    await makeCategory();
    const res = await request(app).get("/sync/bootstrap");
    expect(res.status).toBe(200);
    const cat = res.body.categories[0];
    expect(cat).toHaveProperty("id");
    expect(cat).toHaveProperty("code");
    expect(cat).toHaveProperty("nameEn");
    expect(cat).toHaveProperty("defaultUnit");
  });

  // trustBadgeRevoked is independent of authorizationStatus (only
  // mpcb-refresh.js sets that one) — an admin can revoke a recycler's trust
  // badge after an anomaly without their MPCB listing having lapsed. Both
  // must hide the recycler from the device the same way.
  it("excludes a VALID recycler whose trust badge an admin has revoked", async () => {
    const cat = await makeCategory();
    const valid = await makeRecycler({ name: "Bharat E Waste" });
    const revoked = await makeRecycler({
      name: "Suspect Recyclers Pvt Ltd",
      authorizationStatus: "VALID",
      trustBadgeRevoked: true,
    });
    await publish(valid.id, cat.id, "420.00", "2026-09-01T09:00:00+05:30");
    await publish(revoked.id, cat.id, "999.00", "2026-09-01T09:00:00+05:30");

    const res = await request(app).get("/sync/bootstrap");
    expect(res.status).toBe(200);
    expect(res.body.recyclers.map((r) => r.name)).toEqual(["Bharat E Waste"]);
  });

  it("omits rates belonging to a VALID-but-revoked recycler", async () => {
    const cat = await makeCategory();
    const revoked = await makeRecycler({ authorizationStatus: "VALID", trustBadgeRevoked: true });
    await publish(revoked.id, cat.id, "999.00", "2026-09-01T09:00:00+05:30");

    const res = await request(app).get("/sync/bootstrap");
    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(0);
  });
});
