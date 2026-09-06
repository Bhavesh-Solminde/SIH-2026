import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, truncateAll, makeRecycler } from "./helpers/db.js";
import { MPCB_SOURCE } from "../src/lib/mpcbSource.js";

afterAll(() => prisma.$disconnect());

const app = createApp();

describe("GET /public/authorisation", () => {
  beforeEach(() => truncateAll());

  it("counts what is shown and what is withheld, from the recycler table itself", async () => {
    await makeRecycler({ registrationNo: "A-1", authorizationStatus: "VALID" });
    await makeRecycler({ registrationNo: "A-2", authorizationStatus: "VALID" });
    await makeRecycler({ registrationNo: "A-3", authorizationStatus: "LAPSED_IN_LIST" });

    const res = await request(app).get("/public/authorisation");
    expect(res.status).toBe(200);
    expect(res.body.listed).toBe(3);
    expect(res.body.valid).toBe(2);
    expect(res.body.lapsed).toBe(1);
    expect(res.body.hiddenFromApp).toBe(1);
  });

  it("reports zeroes rather than failing when no list has been seeded", async () => {
    const res = await request(app).get("/public/authorisation");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ listed: 0, valid: 0, lapsed: 0, hiddenFromApp: 0 });
  });

  it("carries the provenance of the list, so the claim is checkable", async () => {
    const res = await request(app).get("/public/authorisation");
    expect(res.body.source.authority).toContain("Maharashtra Pollution Control Board");
    expect(res.body.source.fetchedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.sourceAgeDays).toBeGreaterThanOrEqual(0);
  });

  it("keeps shownInApp equal to the count the ranking gate will accept", async () => {
    await makeRecycler({ registrationNo: "B-1", authorizationStatus: "VALID" });
    await makeRecycler({ registrationNo: "B-2", authorizationStatus: "LAPSED_IN_LIST" });

    const res = await request(app).get("/public/authorisation");
    const gated = await prisma.recycler.count({ where: { authorizationStatus: "VALID" } });
    // If these ever disagree, the page is describing a filter the app does not
    // apply — which is worse than showing no number at all.
    expect(res.body.shownInApp).toBe(gated);
  });
});

describe("MPCB source provenance", () => {
  it("names a real published list rather than an anonymous file", () => {
    expect(MPCB_SOURCE.file).toBe("mpcb_recyclers.csv");
    expect(MPCB_SOURCE.format).toMatch(/no public API/);
  });
});
