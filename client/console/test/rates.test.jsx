import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RatesPage from "../src/app/(protected)/rates/page.jsx";

// Mock navigation — a next/navigation mock must supply useRouter,
// useSearchParams AND usePathname or the page crashes (Nav renders next/link,
// and this monorepo doesn't have @testing-library/user-event installed, so
// fireEvent is used throughout rather than pulling in a new dependency).
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/rates",
}));

vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ApiError: class extends Error {},
}));

vi.mock("../src/lib/useSession.js", () => ({
  useSession: () => ({ id: "r1", name: "Bharat E Waste" }),
}));

const { api } = await import("../src/lib/api.js");

const RATE_ROWS = [
  { categoryCode: "PCB", nameEn: "Circuit board", unit: "KG", price: 190, lastUpdatedDays: 2, stale: false },
];

const AUTHORISATION = {
  listed: 161,
  valid: 74,
  lapsed: 87,
  hiddenFromApp: 87,
  source: { authority: "Maharashtra Pollution Control Board (MPCB)", fetchedOn: "2026-08-31" },
  sourceAgeDays: 6,
};

beforeEach(() => {
  push.mockClear();
  api.get.mockReset();
});

describe("RatesPage — authorisation-evidence panel", () => {
  it("renders the panel with counts fetched from GET /public/authorisation", async () => {
    api.get.mockImplementation((path) => {
      if (path === "/recycler/rates") return Promise.resolve({ rates: RATE_ROWS });
      if (path === "/public/authorisation") return Promise.resolve(AUTHORISATION);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    render(<RatesPage />);

    const panel = await screen.findByTestId("authorisation-panel");
    expect(panel.textContent).toContain("74");
    expect(panel.textContent).toContain("161");
    expect(panel.textContent).toContain("87");
    expect(panel.textContent).toContain("2026-08-31");
  });

  it("still renders the rate table when the authorisation fetch fails — never blocks or blanks the page", async () => {
    api.get.mockImplementation((path) => {
      if (path === "/recycler/rates") return Promise.resolve({ rates: RATE_ROWS });
      if (path === "/public/authorisation") return Promise.reject(new Error("network down"));
      return Promise.reject(new Error(`unexpected path ${path}`));
    });

    render(<RatesPage />);

    // The rate table (unrelated to authorisation) still shows up.
    expect(await screen.findByLabelText("price-PCB")).toBeInTheDocument();
    // No error banner is shown in place of the panel — it just stays absent.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/public/authorisation"));
    expect(screen.queryByTestId("authorisation-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
