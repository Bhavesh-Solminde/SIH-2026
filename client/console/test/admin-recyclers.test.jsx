import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../src/lib/useSession.js", () => ({
  useAdminSession: () => ({ email: "admin@bhaav.demo", role: "ADMIN" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/admin/recyclers" }));
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  ApiError: class extends Error {},
}));

const { api } = await import("../src/lib/api.js");
const AdminRecyclersPage = (await import("../src/app/(protected)/admin/recyclers/page.jsx")).default;

// Copied verbatim from a live GET /admin/recyclers run against the seeded
// demo data (2026-09-07), after the fix that reads each handover's own
// buyerOfferSnapshot instead of an unrelated Rate row.
const RECYCLERS = {
  recyclers: [
    {
      recycler_id: "b8789dd3-1f97-4530-9474-799bdd832e6f",
      name: "Global E-Recycling Pvt Ltd Plot No 2",
      district: null,
      history: "ok",
      sample_size: 19,
      published_rate: 410,
      median_paid: 213.51,
      price_cut_count: 18,
      price_cut_of: 19,
      downgrade_exception_rate: 0.9474,
    },
    {
      recycler_id: "unsampled-1",
      name: "New Recycler",
      district: "Pune",
      history: "insufficient",
      sample_size: 2,
    },
  ],
};

describe("AdminRecyclersPage", () => {
  it("renders the published-vs-paid board and never shows insufficient history as clean", async () => {
    api.get.mockResolvedValue(RECYCLERS);
    render(<AdminRecyclersPage />);

    expect(await screen.findByText(/Global E-Recycling/)).toBeInTheDocument();
    // rupees()/kg and the fraction are adjacent sibling text nodes in the
    // same <td>, so match on substring rather than the cell's exact text.
    expect(screen.getByText((_, node) => node?.textContent === "₹410/kg")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "₹214/kg")).toBeInTheDocument(); // rupees() rounds 213.51
    expect(screen.getByText("18 of 19")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();

    expect(screen.getByText(/New Recycler/)).toBeInTheDocument();
    expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
  });
});
