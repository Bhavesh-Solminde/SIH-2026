import { describe, it, expect } from "vitest";
import { rankRecyclers } from "../src/ranking.js";
import { estimateValue } from "../src/pricing.js";

const FROM = { lat: 19.3919, lng: 72.8397 };
const AS_OF = "2026-09-02T12:00:00+05:30";
const LOT = { categoryCode: "PCB", quantity: 3, condition: "GOOD" };

function recycler(over = {}) {
  return {
    id: "r1",
    name: "R One",
    lat: 19.4,
    lng: 72.84,
    authorizationStatus: "VALID",
    materialsAccepted: ["PCB", "CABLE"],
    serviceAreaKm: 25,
    pickupAvailable: false,
    ...over,
  };
}

function rate(over = {}) {
  return {
    recyclerId: "r1",
    categoryCode: "PCB",
    unit: "KG",
    price: 400,
    validFrom: "2026-09-02T09:00:00+05:30",
    ...over,
  };
}

describe("eligibility gate", () => {
  it("drops a recycler whose authorisation has lapsed in the published list", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [recycler({ authorizationStatus: "LAPSED_IN_LIST" })],
      rates: [rate()],
    });
    expect(out).toEqual([]);
  });

  it("drops a recycler that does not accept this category", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [recycler({ materialsAccepted: ["CABLE"] })],
      rates: [rate()],
    });
    expect(out).toEqual([]);
  });

  it("drops a recycler beyond its own service area", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [recycler({ lat: 21.0, lng: 75.0, serviceAreaKm: 5 })],
      rates: [rate()],
    });
    expect(out).toEqual([]);
  });

  it("drops a recycler with no published rate for this category", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [recycler()],
      rates: [rate({ categoryCode: "CABLE" })],
    });
    expect(out).toEqual([]);
  });

  it("keeps a recycler when the collection point has no GPS, ignoring service area", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: null,
      asOf: AS_OF,
      recyclers: [recycler({ serviceAreaKm: 1 })],
      rates: [rate()],
    });
    expect(out).toHaveLength(1);
    expect(out[0].distanceKm).toBeNull();
  });
});

describe("scoring", () => {
  it("prefers a further recycler that pays enough more — the FLOW.md trade-off", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [
        recycler({ id: "near", name: "Near", lat: 19.3925, lng: 72.8401 }),
        recycler({ id: "far", name: "Far", lat: 19.45, lng: 72.9 }),
      ],
      rates: [
        rate({ recyclerId: "near", price: 300 }),
        rate({ recyclerId: "far", price: 430 }),
      ],
    });
    expect(out[0].recyclerId).toBe("far");
    expect(out[0].recommended).toBe(true);
    expect(out[1].recommended).toBe(false);
  });

  it("computes the value at each recycler's own rate", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [recycler()],
      rates: [rate({ price: 430 })],
    });
    expect(out[0].value).toBe(1290);
  });

  it("penalises a stale rate but does not let it swamp the value term", () => {
    // A 400-day-old rate must not overwhelm a 0.55-weighted value advantage.
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [
        recycler({ id: "fresh", lat: 19.4, lng: 72.84 }),
        recycler({ id: "stale", lat: 19.4, lng: 72.84 }),
      ],
      rates: [
        rate({ recyclerId: "fresh", price: 300, validFrom: "2026-09-02T09:00:00+05:30" }),
        rate({ recyclerId: "stale", price: 600, validFrom: "2025-08-01T09:00:00+05:30" }),
      ],
    });
    expect(out[0].recyclerId).toBe("stale");
    expect(out[0].stalenessDays).toBeGreaterThan(300);
  });

  it("reports staleness in whole days from the rate's valid_from", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [recycler()],
      rates: [rate({ validFrom: "2026-08-30T12:00:00+05:30" })],
    });
    expect(out[0].stalenessDays).toBe(3);
  });

  it("rewards pickup availability when everything else ties", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      recyclers: [
        recycler({ id: "nopickup", pickupAvailable: false }),
        recycler({ id: "pickup", pickupAvailable: true }),
      ],
      rates: [rate({ recyclerId: "nopickup" }), rate({ recyclerId: "pickup" })],
    });
    expect(out[0].recyclerId).toBe("pickup");
  });
});

describe("agrees with estimateValue — single-sourced condition factors", () => {
  it("scores the same rupee value that estimateValue shows the collector, for the same lot", () => {
    const quantity = 3;
    const unitPrice = 430;
    const condition = "FAIR";
    const out = rankRecyclers({
      lot: { ...LOT, quantity, condition },
      from: FROM,
      asOf: AS_OF,
      recyclers: [recycler()],
      rates: [rate({ price: unitPrice })],
    });
    expect(out[0].value).toBe(estimateValue({ quantity, unitPrice, condition }));
  });
});

describe("re-sorting — the collector must be able to disagree", () => {
  it("sorts by pure value on request", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      sortBy: "value",
      recyclers: [
        recycler({ id: "near", lat: 19.3925, lng: 72.8401 }),
        recycler({ id: "far", lat: 19.6, lng: 73.0, serviceAreaKm: 100 }),
      ],
      rates: [rate({ recyclerId: "near", price: 300 }), rate({ recyclerId: "far", price: 310 })],
    });
    expect(out.map((r) => r.recyclerId)).toEqual(["far", "near"]);
  });

  it("sorts by pure distance on request", () => {
    const out = rankRecyclers({
      lot: LOT,
      from: FROM,
      asOf: AS_OF,
      sortBy: "distance",
      recyclers: [
        recycler({ id: "near", lat: 19.3925, lng: 72.8401 }),
        recycler({ id: "far", lat: 19.6, lng: 73.0, serviceAreaKm: 100 }),
      ],
      rates: [rate({ recyclerId: "near", price: 300 }), rate({ recyclerId: "far", price: 900 })],
    });
    expect(out.map((r) => r.recyclerId)).toEqual(["near", "far"]);
  });
});
