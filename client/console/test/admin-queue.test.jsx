import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../src/lib/useSession.js", () => ({
  useAdminSession: () => ({ email: "admin@bhaav.demo", role: "ADMIN" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/admin/queue" }));
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  ApiError: class extends Error {},
}));

const { api } = await import("../src/lib/api.js");
const AdminQueuePage = (await import("../src/app/(protected)/admin/queue/page.jsx")).default;

beforeEach(() => vi.clearAllMocks());

// Response shapes below are copied verbatim from a live GET /admin/summary
// and GET /admin/flags run against the seeded demo data (2026-09-07) —
// not invented shapes, the actual contract this page consumes.
const SUMMARY = {
  open_flags_by_severity: { INFO: 0, WARN: 12, CRITICAL: 18 },
  handovers_total: 58,
  handovers_scored: 55,
  handovers_unscored: 3,
  parties_over_flag_rate_line: 7,
  flag_rate_threshold: 0.2,
  min_sample_size: 5,
  model: "https://sihmodel.vercel.app",
};

const FLAGS = {
  flags: [
    {
      id: "58a3a965-ca5e-4e38-8399-637ccce7f62e",
      subject_type: "RECYCLER",
      subject_id: "b8789dd3-1f97-4530-9474-799bdd832e6f",
      detector_code: "ML_FLAG_RATE",
      severity: "CRITICAL",
      detail: { rate: 0.9474, total: 19, flagged: 18, threshold: 0.2 },
      admin_outcome: null,
      created_at: "2026-09-07T10:17:15.067Z",
      resolved_at: null,
      sentence: "18 of this party's last 19 scored transactions were flagged by the price model (95%, over the 20% line).",
      recycler_id: "b8789dd3-1f97-4530-9474-799bdd832e6f",
      recycler_name: "Global E-Recycling Pvt Ltd Plot No 2",
      collector_id: null,
      category: null,
      quantity: null,
      value_at_stake: 14396,
      party_flag_rate: 0.9474,
      history: "ok",
      priority: 40915.2,
    },
  ],
  candidates_considered: 30,
  limit: 20,
};

describe("AdminQueuePage", () => {
  it("renders the summary strip and the ranked queue from the live API shapes", async () => {
    api.get.mockImplementation((path) => {
      if (path === "/admin/summary") return Promise.resolve(SUMMARY);
      return Promise.resolve(FLAGS);
    });

    render(<AdminQueuePage />);

    expect(await screen.findByText(/18 of this party's last 19/i)).toBeInTheDocument();
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText(/Global E-Recycling/)).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument(); // open CRITICAL count in the summary strip
  });

  it("shows the empty state when the queue has nothing open", async () => {
    api.get.mockImplementation((path) => {
      if (path === "/admin/summary") return Promise.resolve({ ...SUMMARY, open_flags_by_severity: { INFO: 0, WARN: 0, CRITICAL: 0 } });
      return Promise.resolve({ flags: [], candidates_considered: 0, limit: 20 });
    });

    render(<AdminQueuePage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/summary"));
    expect(await screen.findByText(/no open flags/i)).toBeInTheDocument();
  });

  it("runs detection and reloads the queue on click", async () => {
    api.get.mockImplementation((path) => {
      if (path === "/admin/summary") return Promise.resolve(SUMMARY);
      return Promise.resolve(FLAGS);
    });
    api.post.mockResolvedValue({ rescored: 3, results: [] });

    render(<AdminQueuePage />);
    await screen.findByText(/18 of this party's last 19/i);

    fireEvent.click(screen.getByRole("button", { name: /run detection/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/rescore", {}));
  });
});
