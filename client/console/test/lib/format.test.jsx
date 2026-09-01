import { describe, it, expect } from "vitest";
import { rupees, pct, shortDate } from "../../src/lib/format.js";

describe("rupees", () => {
  it("formats with the rupee sign and Indian grouping", () => {
    expect(rupees(1290)).toBe("₹1,290");
    expect(rupees(129000)).toBe("₹1,29,000");
  });
  it("shows a dash for null", () => {
    expect(rupees(null)).toBe("—");
  });
});

describe("pct", () => {
  it("renders a ratio as a whole percent", () => {
    expect(pct(0.78)).toBe("78%");
  });
});

describe("shortDate", () => {
  it("formats an ISO timestamp as a day and month", () => {
    expect(shortDate("2026-09-02T12:40:00+05:30")).toMatch(/2/);
  });
  it("returns a dash for null", () => {
    expect(shortDate(null)).toBe("—");
  });
});
