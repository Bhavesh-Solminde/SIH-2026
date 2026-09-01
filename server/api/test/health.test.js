import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "./helpers/db.js";

afterAll(() => prisma.$disconnect());

describe("GET /health", () => {
  it("reports ok and a reachable database", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("ok");
  });
});

describe("unknown routes", () => {
  it("returns a json 404, never an html error page", async () => {
    const res = await request(createApp()).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
