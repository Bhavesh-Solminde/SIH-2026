import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HistoryPage from "../src/app/(protected)/history/page.jsx";

// Mock navigation (used by Nav and useSession). Nav also reads usePathname
// for its active-tab underline — omitting it throws "No usePathname export
// is defined", same as useRouter/useSearchParams above it.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/history" }));

// Mock api
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), getBlob: vi.fn(), post: vi.fn() },
  ApiError: class extends Error {},
}));

// Mock useSession — return a recycler immediately so the page renders
vi.mock("../src/lib/useSession.js", () => ({
  useSession: () => ({ id: "r1", name: "Test Recycler" }),
}));

const { api } = await import("../src/lib/api.js");

// Shape matches the real server response — server/api/src/routes/recycler.js
// GET /recycler/history returns { data, page, totalPages, total }, and each
// row carries reference_code/category_name/inspected_quantity/final_total/
// handover_ts/downgrade_reason_code, not the lot_ref/category/quantity/unit/
// declared_condition/collector_estimate/agreed_price/date fields the page
// (and this test) previously assumed — that mismatch meant the page never
// rendered a single row against the real API. See history/page.jsx.
const MOCK_HANDOVERS = [
  {
    id: "h1",
    reference_code: "LOT-2026-001",
    category_name: "PCB",
    inspected_quantity: 5,
    inspected_condition: "GOOD",
    downgrade_reason_code: null,
    final_total: 2000,
    handover_ts: "2026-08-15T09:00:00+05:30",
  },
  {
    id: "h2",
    reference_code: "LOT-2026-002",
    category_name: "BATTERY",
    inspected_quantity: 10,
    inspected_condition: "FAIR",  // downgraded
    downgrade_reason_code: "VISUAL_DAMAGE",
    final_total: 600,
    handover_ts: "2026-08-20T11:00:00+05:30",
  },
];

beforeEach(() => {
  push.mockClear();
  api.get.mockReset();
  api.getBlob.mockReset();
});

describe("HistoryPage", () => {
  it("calls GET /recycler/history and renders the handover list", async () => {
    api.get.mockResolvedValue({ data: MOCK_HANDOVERS, total: 2 });
    render(<HistoryPage />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/recycler/history"))
    );

    expect(await screen.findByText("LOT-2026-001")).toBeInTheDocument();
    expect(screen.getByText("LOT-2026-002")).toBeInTheDocument();
  });

  it("highlights rows with a non-null downgrade_reason_code", async () => {
    api.get.mockResolvedValue({ data: MOCK_HANDOVERS, total: 2 });
    render(<HistoryPage />);

    await screen.findByText("LOT-2026-001");

    const rows = document.querySelectorAll("tr[data-downgraded]");
    expect(rows).toHaveLength(1);
    // the downgraded row is for LOT-2026-002
    expect(rows[0].textContent).toContain("LOT-2026-002");
  });

  it("renders empty state when there are no handovers", async () => {
    api.get.mockResolvedValue({ handovers: [], total: 0 });
    render(<HistoryPage />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/recycler/history"))
    );

    expect(screen.getByText(/no handovers yet/i)).toBeInTheDocument();
  });
});
