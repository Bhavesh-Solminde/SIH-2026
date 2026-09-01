import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("bhaav-demo-2026");
    expect(await verifyPassword("bhaav-demo-2026", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("bhaav-demo-2026");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently each time", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
