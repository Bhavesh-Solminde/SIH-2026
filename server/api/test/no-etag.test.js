import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./helpers/db.js";

const app = createApp();

afterAll(() => prisma.$disconnect());

// Express sends an ETag on every JSON response by default. A browser resolves
// the resulting bodyless 304 from its own HTTP cache; React Native's fetch has
// no such cache, so the 304 rejects with "Network request failed" — which in
// the app's log is indistinguishable from the phone having no route to the
// server. The API log meanwhile shows a healthy stream of 304s.
//
// These tests exist so that failure mode cannot come back silently.
describe("HTTP caching headers", () => {
  it("sends no ETag, so a repeat request can never become a bodyless 304", async () => {
    const res = await request(app).get("/public/authorisation");

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBeUndefined();
  });

  it("answers a conditional request with a full body rather than 304", async () => {
    // A client that kept an old validator must still get real data back.
    const res = await request(app)
      .get("/public/authorisation")
      .set("If-None-Match", '"stale-validator-from-a-previous-deploy"');

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(304);
    expect(res.body).toHaveProperty("listed");
    expect(res.body).toHaveProperty("valid");
  });

  it("serves the collector app's rate endpoint unconditionally too", async () => {
    // ValueScreen polls this on every visit; it is the screen that surfaced
    // the bug, and the one where a silent failure costs the most — it is the
    // screen the whole product argument rests on.
    const res = await request(app)
      .get("/public/rates")
      .set("If-None-Match", '"stale-validator-from-a-previous-deploy"');

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBeUndefined();
  });
});
