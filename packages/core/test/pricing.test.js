import { describe, it, expect } from "vitest";
import { conditionFactorFor, estimateValue, round2 } from "../src/pricing.js";

describe("conditionFactorFor", () => {
  it("returns the DB.md section 3.5 defaults", () => {
    expect(conditionFactorFor("GOOD")).toBe(1.0);
    expect(conditionFactorFor("FAIR")).toBe(0.85);
    expect(conditionFactorFor("POOR")).toBe(0.7);
  });

  it("throws on an unknown condition rather than silently defaulting", () => {
    expect(() => conditionFactorFor("UNKNOWN")).toThrow(/unknown condition/i);
  });
});

describe("estimateValue", () => {
  it("multiplies quantity by rate by condition factor", () => {
    // FRONTEND.md S5 worked example: 3 kg at 420/kg, GOOD
    expect(estimateValue({ quantity: 3, unitPrice: 420, condition: "GOOD" })).toBe(1260);
  });

  it("applies the FAIR multiplier", () => {
    expect(estimateValue({ quantity: 3, unitPrice: 420, condition: "FAIR" })).toBe(1071);
  });

  it("rounds to two decimals, half away from zero", () => {
    expect(estimateValue({ quantity: 1.235, unitPrice: 100, condition: "GOOD" })).toBe(123.5);
    expect(estimateValue({ quantity: 0.005, unitPrice: 1, condition: "GOOD" })).toBe(0.01);
  });

  it("rejects a non-positive quantity", () => {
    expect(() => estimateValue({ quantity: 0, unitPrice: 420, condition: "GOOD" })).toThrow(
      /quantity/i,
    );
  });

  it("rejects a negative price", () => {
    expect(() => estimateValue({ quantity: 1, unitPrice: -1, condition: "GOOD" })).toThrow(
      /price/i,
    );
  });
});

describe("round2", () => {
  it("does not inherit binary floating point error", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
