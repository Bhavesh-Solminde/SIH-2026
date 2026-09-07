import { webDirectionsUrl, nativeDirectionsUrl, shareMessage, hasLocation }
  from "../../src/lib/directions";

const YARD = { name: "Bharat E Waste", address: "Waliv, Vasai East", lat: 19.4012, lng: 72.8397 };

describe("directions links", () => {
  it("builds a Google Maps directions link that resolves without an app", () => {
    expect(webDirectionsUrl(YARD))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=19.4012,72.8397");
  });

  it("uses the Android geo: intent so the default maps app opens", () => {
    expect(nativeDirectionsUrl(YARD, "android"))
      .toBe("geo:19.4012,72.8397?q=19.4012,72.8397(Bharat%20E%20Waste)");
  });

  it("uses the iOS maps: scheme, which ignores geo:", () => {
    expect(nativeDirectionsUrl(YARD, "ios")).toBe("maps://?daddr=19.4012,72.8397&q=Bharat%20E%20Waste");
  });
});

describe("shared address", () => {
  it("stays readable when the link is never tapped", () => {
    expect(shareMessage(YARD)).toBe(
      "Bharat E Waste\nWaliv, Vasai East\n19.401200, 72.839700\n" +
      "https://www.google.com/maps/dir/?api=1&destination=19.4012,72.8397",
    );
  });

  it("omits a missing address rather than printing a blank line", () => {
    expect(shareMessage({ ...YARD, address: null }).split("\n")).toHaveLength(3);
  });
});

describe("hasLocation gate", () => {
  it("accepts a recycler with real coordinates", () => {
    expect(hasLocation(YARD)).toBe(true);
  });

  it.each([
    ["null coordinates", { lat: null, lng: null }],
    ["a null-island 0,0 row, which is a missing geocode not a place", { lat: 0, lng: 0 }],
    ["no recycler at all", null],
  ])("hides the buttons for %s", (_label, r) => {
    expect(hasLocation(r)).toBe(false);
  });
});
