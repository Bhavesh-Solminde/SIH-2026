import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HistoryPage from "../src/app/(protected)/history/page.jsx";

// Mock navigation (used by Nav and useSession)
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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

const MOCK_HANDOVERS = [
  {
    id: "h1",
    lot_ref: "LOT-2026-001",
    category: "PCB",
    quantity: 5,
    unit: "KG",
    declared_condition: "GOOD",
    inspected_condition: "GOOD",
    collector_estimate: 2100,
    agreed_price: 2000,
    date: "2026-08-15T09:00:00+05:30",
  },
  {
    id: "h2",
    lot_ref: "LOT-2026-002",
    category: "BATTERY",
    quantity: 10,
    unit: "KG",
    declared_condition: "GOOD",
    inspected_condition: "FAIR",  // downgraded
    collector_estimate: 800,
    agreed_price: 600,
    date: "2026-08-20T11:00:00+05:30",
  },
];

beforeEach(() => {
  push.mockClear();
  api.get.mockReset();
  api.getBlob.mockReset();
});

describe("HistoryPage", () => {
  it("calls GET /recycler/history and renders the handover list", async () => {
    api.get.mockResolvedValue({ handovers: MOCK_HANDOVERS, total: 2 });
    render(<HistoryPage />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/recycler/history"))
    );

    expect(await screen.findByText("LOT-2026-001")).toBeInTheDocument();
    expect(screen.getByText("LOT-2026-002")).toBeInTheDocument();
  });

  it("highlights rows where inspected_condition differs from declared_condition", async () => {
    api.get.mockResolvedValue({ handovers: MOCK_HANDOVERS, total: 2 });
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
