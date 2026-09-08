import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../src/lib/useSession.js", () => ({
  useAdminSession: () => ({ email: "admin@bhaav.demo", role: "ADMIN" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/admin/reports" }));
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  ApiError: class extends Error {},
}));

const { api } = await import("../src/lib/api.js");
const AdminReportsPage = (await import("../src/app/(protected)/admin/reports/page.jsx")).default;

beforeEach(() => vi.clearAllMocks());

// Shape copied verbatim from a live GET /reports?status=all run against real
// data (2026-09-08) — the actual DISPUTED report a collector filed through
// LedgerScreen, not an invented fixture.
const REPORTS = {
  reports: [
    {
      id: "03548bc6-7151-4576-bf21-ff53a27048dc",
      status: "OPEN",
      reason: "Not the price that we discussed",
      created_at: "2026-09-07T20:04:15.638Z",
      handover_id: "01a07d62-6948-7000-aa7e-59f1e1954f9f",
      reference_code: "M5WSE0MM",
      final_total: 19630,
      handover_status: "DISPUTED",
      recycler: { id: "b8789dd3-1f97-4530-9474-799bdd832e6f", name: "Global E-Recycling Pvt Ltd Plot No 2" },
      category_code: "MOTOR",
      quantity: 302,
      unit: "KG",
    },
  ],
};

describe("AdminReportsPage", () => {
  it("renders collector reports fetched from GET /reports", async () => {
    api.get.mockResolvedValue(REPORTS);

    render(<AdminReportsPage />);

    expect(await screen.findByText(/Not the price that we discussed/i)).toBeInTheDocument();
    expect(screen.getByText(/Global E-Recycling/)).toBeInTheDocument();
    expect(screen.getByText(/₹19,630/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/reports?status=open");
  });

  it("shows the empty state when there are no reports", async () => {
    api.get.mockResolvedValue({ reports: [] });

    render(<AdminReportsPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(await screen.findByText(/no reports/i)).toBeInTheDocument();
  });

  it("marking a report reviewed removes it from the OPEN view", async () => {
    api.get.mockResolvedValue(REPORTS);
    api.post.mockResolvedValue({ id: REPORTS.reports[0].id, status: "REVIEWED" });

    render(<AdminReportsPage />);
    await screen.findByText(/Not the price that we discussed/i);

    fireEvent.click(screen.getByRole("button", { name: /mark reviewed/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      `/reports/${REPORTS.reports[0].id}/resolve`, {},
    ));
    await waitFor(() => expect(screen.queryByText(/Not the price that we discussed/i)).not.toBeInTheDocument());
  });

  it("switching the status filter refetches with the new status", async () => {
    api.get.mockResolvedValue(REPORTS);

    render(<AdminReportsPage />);
    await screen.findByText(/Not the price that we discussed/i);

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "reviewed" } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/reports?status=reviewed"));
  });
});
