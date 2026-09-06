import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// NOTE: the plan's verbatim test uses `@testing-library/user-event`, but that
// package is not installed anywhere in this monorepo (not in
// client/console/package.json, not hoisted at the workspace root, and not in
// any lockfile) and this task's ownership boundary forbids touching
// package.json/package-lock.json. Substituted `fireEvent.click` from the
// already-installed `@testing-library/react`, which is behaviorally
// equivalent for this single synchronous click. See final report.

vi.mock("../src/lib/useSession.js", () => ({
  useSession: () => ({ id: "r1", name: "Bharat E Waste" }),
}));
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ApiError: class extends Error {},
}));
// The plan's verbatim test omits this, but FlagsPage renders <Nav />, which
// calls next/navigation's useRouter() — without this mock every test fails
// with "invariant expected app router to be mounted" before the component
// under test even matters. Every sibling full-page test (e.g.
// test/verify.test.jsx) already mocks it this same way. See final report.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { api } = await import("../src/lib/api.js");
const FlagsPage = (await import("../src/app/(protected)/flags/page.jsx")).default;

const MOCK_FLAGS = [
  {
    id: "f1",
    detector_code: "D1",
    severity: "WARN",
    description: "Unusually low weight for declared category",
    subject: "LOT-2026-001",
    raised_at: "2026-08-25T08:00:00+05:30",
  },
  {
    id: "f2",
    detector_code: "D9",
    severity: "CRITICAL",
    description: "Price agreed is more than 40% below market rate",
    subject: "BATTERY",
    raised_at: "2026-08-26T10:00:00+05:30",
  },
];

beforeEach(() => vi.clearAllMocks());

describe("FlagsPage", () => {
  // Pre-existing coverage (from commit bbb012f) for the flag-list rendering
  // this task's plan explicitly leaves unchanged. Restored here after this
  // file was recreated for the "Run detection" feature tests below, so the
  // severity-badge behavior stays under regression coverage.
  it("renders flags with WARN and CRITICAL badges", async () => {
    api.get.mockResolvedValue({ flags: MOCK_FLAGS });
    render(<FlagsPage />);

    expect(await screen.findByText("WARN")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("D1")).toBeInTheDocument();
    expect(screen.getByText("D9")).toBeInTheDocument();
  });

  it("shows severity badge colors — WARN is amber, CRITICAL is red", async () => {
    api.get.mockResolvedValue({ flags: MOCK_FLAGS });
    render(<FlagsPage />);

    const warnBadge = await screen.findByLabelText("severity WARN");
    const criticalBadge = screen.getByLabelText("severity CRITICAL");

    // WARN → amber background
    expect(warnBadge.style.background).toBe("rgb(254, 243, 199)");
    // CRITICAL → red background
    expect(criticalBadge.style.background).toBe("rgb(254, 226, 226)");
  });

  it("shows empty state message when there are no flags", async () => {
    api.get.mockResolvedValue({ flags: [] });
    render(<FlagsPage />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/recycler/flags")
    );

    expect(screen.getByText(/no flags — all clear/i)).toBeInTheDocument();
  });

  it("runs detection and reports how many flags were written", async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({
      runId: "run-1",
      status: "ok",
      detectorsRun: ["D1", "D2", "D9"],
      detectorsSkipped: [{ code: "D10", reason: "insufficient dated history" }],
      flagsWritten: 3,
    });

    render(<FlagsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /run detection/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/detect-run", {}));
    expect(await screen.findByText(/3 flags written/i)).toBeInTheDocument();
    expect(screen.getByText(/D10/)).toBeInTheDocument();
  });

  it("says so plainly when the detector service is unavailable", async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({
      runId: "run-2",
      status: "pending",
      reason: "timeout after 2000ms",
      flagsWritten: 0,
    });

    render(<FlagsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /run detection/i }));

    expect(await screen.findByText(/detector service unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/timeout after 2000ms/i)).toBeInTheDocument();
  });
});
