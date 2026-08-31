import { describe, it, expect } from "vitest";
import { uuidv7, referenceCodeFromUuid } from "../src/ids.js";

describe("uuidv7", () => {
  it("produces a well-formed version 7 uuid", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sorts lexicographically in creation order", async () => {
    const first = uuidv7();
    await new Promise((r) => setTimeout(r, 3));
    const second = uuidv7();
    expect(first < second).toBe(true);
  });

  it("does not collide across a tight loop", () => {
    const ids = new Set();
    for (let i = 0; i < 5000; i += 1) ids.add(uuidv7());
    expect(ids.size).toBe(5000);
  });
});

describe("referenceCodeFromUuid", () => {
  it("is 8 characters of Crockford Base32", () => {
    const code = referenceCodeFromUuid("018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b");
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
  });

  it("is deterministic — the device and the server derive the same code", () => {
    const uuid = "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b";
    expect(referenceCodeFromUuid(uuid)).toBe(referenceCodeFromUuid(uuid));
  });

  it("differs for different uuids", () => {
    expect(referenceCodeFromUuid("018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b")).not.toBe(
      referenceCodeFromUuid("018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5c"),
    );
  });

  it("rejects a malformed uuid instead of producing a short code", () => {
    expect(() => referenceCodeFromUuid("not-a-uuid")).toThrow(/uuid/i);
  });
});
