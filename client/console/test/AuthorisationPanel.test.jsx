import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthorisationPanel from "../src/components/AuthorisationPanel.jsx";

/**
 * Task 9 — the authorisation-evidence panel.
 *
 * A tick on every recycler carries zero information because both the
 * console and the app only ever show `authorizationStatus: VALID` rows.
 * What is demonstrable is the filtering itself. This panel must render
 * live counts from GET /public/authorisation (never literals), must carry
 * the source's refresh date so the claim is checkable, and must never
 * phrase a lapsed listing as unlawful (README.md ground rule 1).
 */
const AUTHORISATION = {
  listed: 161,
  valid: 74,
  lapsed: 87,
  shownInApp: 74,
  hiddenFromApp: 87,
  source: {
    authority: "Maharashtra Pollution Control Board (MPCB)",
    list: "Authorised E-Waste Recyclers and Dismantlers",
    fetchedOn: "2026-08-31",
  },
  sourceAgeDays: 6,
};

describe("AuthorisationPanel", () => {
  it("renders the counts from the API response, not hardcoded literals", () => {
    render(<AuthorisationPanel authorisation={AUTHORISATION} />);
    const panel = screen.getByTestId("authorisation-panel");
    expect(panel.textContent).toContain("161");
    expect(panel.textContent).toContain("74");
    expect(panel.textContent).toContain("87");
  });

  it("reflects a different API response with different numbers — proves it is not literal text", () => {
    render(
      <AuthorisationPanel
        authorisation={{ listed: 10, valid: 3, lapsed: 7, hiddenFromApp: 7, source: { fetchedOn: "2026-01-01" } }}
      />
    );
    const panel = screen.getByTestId("authorisation-panel");
    expect(panel.textContent).toContain("10");
    expect(panel.textContent).toContain("3");
    expect(panel.textContent).toContain("7");
    expect(panel.textContent).not.toContain("161");
  });

  it("shows when the list was last refreshed — a count with no date is unverifiable", () => {
    render(<AuthorisationPanel authorisation={AUTHORISATION} />);
    expect(screen.getByTestId("authorisation-panel").textContent).toContain("2026-08-31");
  });

  it("names the real MPCB source rather than an anonymous file", () => {
    render(<AuthorisationPanel authorisation={AUTHORISATION} />);
    const text = screen.getByTestId("authorisation-panel").textContent;
    expect(text).toContain("Maharashtra Pollution Control Board");
  });

  it("never implies a lapsed facility is unlawful (README ground rule 1: LAPSED_IN_LIST != unlawful)", () => {
    render(<AuthorisationPanel authorisation={AUTHORISATION} />);
    const text = screen.getByTestId("authorisation-panel").textContent;
    expect(text).not.toMatch(/illegal/i);
    expect(text).not.toMatch(/unauthoris/i);
    expect(text).not.toMatch(/unlawful/i);
    expect(text).not.toMatch(/banned/i);
    expect(text).toMatch(/hidden|lapsed/i);
  });

  it("renders nothing when there is no data yet — never an error state", () => {
    render(<AuthorisationPanel authorisation={null} />);
    expect(screen.queryByTestId("authorisation-panel")).not.toBeInTheDocument();
  });

  it("renders nothing when the list has never been seeded (listed: 0)", () => {
    render(<AuthorisationPanel authorisation={{ listed: 0, valid: 0, lapsed: 0, hiddenFromApp: 0 }} />);
    expect(screen.queryByTestId("authorisation-panel")).not.toBeInTheDocument();
  });
});
