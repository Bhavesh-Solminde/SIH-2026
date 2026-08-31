import { describe, it, expect } from "vitest";
import {
  CATEGORY_CODES,
  UNITS,
  CONDITIONS,
  RANKING_WEIGHTS,
  DOWNGRADE_REASON_CODES,
} from "../src/constants.js";

describe("controlled vocabularies", () => {
  it("lists the eight material categories from FRONTEND.md S2", () => {
    expect(CATEGORY_CODES).toEqual([
      "CABLE",
      "PCB",
      "PANEL",
      "CRT",
      "BATTERY",
      "MOTOR",
      "PLASTIC",
      "OTHER",
    ]);
  });

  it("allows only KG and PIECE as units", () => {
    expect(UNITS).toEqual(["KG", "PIECE"]);
  });

  it("allows only three conditions and no unknown", () => {
    expect(CONDITIONS).toEqual(["GOOD", "FAIR", "POOR"]);
  });

  it("carries the AI.md section 2 ranking weights", () => {
    expect(RANKING_WEIGHTS).toEqual({ value: 0.55, distance: 0.3, pickup: 0.1, staleness: 0.05 });
  });

  it("lists the seven fixed downgrade reason codes", () => {
    expect(DOWNGRADE_REASON_CODES).toHaveLength(7);
    expect(DOWNGRADE_REASON_CODES).toContain("POOR_CONDITION");
    expect(DOWNGRADE_REASON_CODES).toContain("LOCAL_RATE_LOWER");
  });
});
