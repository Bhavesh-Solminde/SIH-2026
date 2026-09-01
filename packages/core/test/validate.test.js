import { describe, it, expect } from "vitest";
import { validateRecord } from "../src/validate.js";

const lot = {
  id: "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5b",
  collector_id: "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5c",
  category_id: "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a5d",
  unit: "KG",
  quantity: 3,
  condition: "GOOD",
  estimated_value: 1260,
  collection_ts: "2026-09-02T10:14:00+05:30",
  status: "DRAFT",
  device_id: "pixel-demo",
};

describe("validateRecord('lot')", () => {
  it("accepts a well-formed lot", () => {
    expect(validateRecord("lot", lot)).toEqual([]);
  });

  it("rejects a unit outside KG and PIECE", () => {
    expect(validateRecord("lot", { ...lot, unit: "TONNE" })).toContain("unit must be one of KG, PIECE");
  });

  it("rejects a fractional quantity when the unit is PIECE", () => {
    expect(validateRecord("lot", { ...lot, unit: "PIECE", quantity: 2.5 })).toContain(
      "quantity must be a whole number when unit is PIECE",
    );
  });

  it("rejects a missing condition — there is no unknown", () => {
    expect(validateRecord("lot", { ...lot, condition: undefined })).toContain(
      "condition must be one of GOOD, FAIR, POOR",
    );
  });

  it("rejects a quantity beyond absolute sanity bounds", () => {
    expect(validateRecord("lot", { ...lot, quantity: 100000 })).toContain(
      "quantity 100000 is outside the sanity bound of 5000",
    );
  });

  it("accepts a null source_type — it is analytical and skippable", () => {
    expect(validateRecord("lot", { ...lot, source_type: null })).toEqual([]);
  });

  it("rejects a non-uuid id", () => {
    expect(validateRecord("lot", { ...lot, id: "42" })).toContain("id must be a uuid");
  });
});

describe("validateRecord('handover')", () => {
  const handover = {
    id: "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a60",
    lot_id: lot.id,
    recycler_id: "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a61",
    reference_code: "0RY6MJ9V",
    inspected_quantity: 2.9,
    final_unit_price: 390,
    final_total: 1131,
    handover_ts: "2026-09-02T12:40:00+05:30",
    status: "PENDING_COLLECTOR",
  };

  it("accepts a well-formed handover", () => {
    expect(validateRecord("handover", handover)).toEqual([]);
  });

  it("rejects a CONFIRMED handover missing confirmation timestamps", () => {
    expect(
      validateRecord("handover", { ...handover, status: "CONFIRMED" }),
    ).toContain("a CONFIRMED handover needs both confirmation timestamps");
  });

  it("accepts a CONFIRMED handover with both timestamps", () => {
    expect(
      validateRecord("handover", {
        ...handover,
        status: "CONFIRMED",
        recycler_confirmed_at: "2026-09-02T12:50:00+05:30",
        collector_confirmed_at: "2026-09-02T12:55:00+05:30",
      }),
    ).toEqual([]);
  });
});

describe("validateRecord('acceptance')", () => {
  it("rejects a negative accepted_rate", () => {
    const errs = validateRecord("acceptance", {
      id: "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a62",
      lot_id: lot.id,
      recycler_id: "018f1a2b-3c4d-7e5f-8a9b-0c1d2e3f4a63",
      accepted_rate: -1,
      accepted_unit: "KG",
      accepted_ts: "2026-09-02T10:15:00+05:30",
    });
    expect(errs).toContain("accepted_rate must be zero or greater");
  });
});

describe("validateRecord — unknown type", () => {
  it("rejects rather than silently accepting", () => {
    expect(validateRecord("wombat", {})).toContain("unknown record type: wombat");
  });
});
