import { describe, it, expect } from "vitest";
import { haversineKm, impliedKmph } from "../src/geo.js";

const VASAI = { lat: 19.3919, lng: 72.8397 };
const NALASOPARA = { lat: 19.4176, lng: 72.8562 };

describe("haversineKm", () => {
  it("measures a known short hop to within 100 m", () => {
    const km = haversineKm(VASAI, NALASOPARA);
    expect(km).toBeGreaterThan(3.2);
    expect(km).toBeLessThan(3.5);
  });

  it("is zero for identical points", () => {
    expect(haversineKm(VASAI, VASAI)).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineKm(VASAI, NALASOPARA)).toBeCloseTo(haversineKm(NALASOPARA, VASAI), 9);
  });

  it("returns null rather than zero when a coordinate is missing", () => {
    expect(haversineKm(VASAI, { lat: null, lng: null })).toBeNull();
    expect(haversineKm(null, NALASOPARA)).toBeNull();
    expect(haversineKm(VASAI, { lat: 19.4, lng: undefined })).toBeNull();
  });
});

describe("impliedKmph", () => {
  it("computes speed over the two geotags", () => {
    const kmph = impliedKmph({
      from: VASAI,
      to: NALASOPARA,
      fromTs: "2026-09-02T10:00:00+05:30",
      toTs: "2026-09-02T11:00:00+05:30",
    });
    expect(kmph).toBeGreaterThan(3.2);
    expect(kmph).toBeLessThan(3.5);
  });

  it("clamps a sub-36-second interval so a same-instant pair cannot divide by zero", () => {
    const kmph = impliedKmph({
      from: VASAI,
      to: NALASOPARA,
      fromTs: "2026-09-02T10:00:00+05:30",
      toTs: "2026-09-02T10:00:00+05:30",
    });
    // 0.01 h floor, per the SERVER.md section 10 D7 query
    expect(kmph).toBeGreaterThan(300);
  });

  it("returns null when either geotag is absent", () => {
    expect(
      impliedKmph({
        from: VASAI,
        to: null,
        fromTs: "2026-09-02T10:00:00+05:30",
        toTs: "2026-09-02T11:00:00+05:30",
      }),
    ).toBeNull();
  });
});
