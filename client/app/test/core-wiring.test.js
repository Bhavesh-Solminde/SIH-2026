import { estimateValue } from "@bhaav/core/pricing";
import { referenceCodeFromUuid, uuidv7 } from "@bhaav/core/ids";
import { rankRecyclers } from "@bhaav/core/ranking";
import { CATEGORY_CODES } from "@bhaav/core/constants";

describe("@bhaav/core is importable from the app", () => {
  it("computes the same estimate the server does", () => {
    expect(estimateValue({ quantity: 3, unitPrice: 420, condition: "GOOD" })).toBe(1260);
  });

  it("derives a reference code on the device", () => {
    const id = uuidv7();
    expect(referenceCodeFromUuid(id)).toHaveLength(8);
  });

  it("ranks recyclers offline", () => {
    const out = rankRecyclers({
      lot: { categoryCode: "PCB", quantity: 3, condition: "GOOD" },
      from: { lat: 19.3919, lng: 72.8397 },
      asOf: "2026-09-02T12:00:00+05:30",
      recyclers: [
        {
          id: "r1",
          name: "R",
          lat: 19.4,
          lng: 72.84,
          authorizationStatus: "VALID",
          materialsAccepted: ["PCB"],
          serviceAreaKm: 25,
          pickupAvailable: false,
        },
      ],
      rates: [
        {
          recyclerId: "r1",
          categoryCode: "PCB",
          unit: "KG",
          price: 430,
          validFrom: "2026-09-02T09:00:00+05:30",
        },
      ],
    });
    expect(out[0].value).toBe(1290);
    expect(out[0].recommended).toBe(true);
  });

  it("exposes the eight category codes", () => {
    expect(CATEGORY_CODES).toHaveLength(8);
  });
});
