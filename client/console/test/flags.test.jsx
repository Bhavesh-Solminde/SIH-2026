import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import FlagsPage from "../src/app/(protected)/flags/page.jsx";

// Mock navigation (used by Nav and useSession)
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Mock api
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ApiError: class extends Error {},
}));

// Mock useSession — return a recycler immediately so the page renders
vi.mock("../src/lib/useSession.js", () => ({
  useSession: () => ({ id: "r1", name: "Test Recycler" }),
}));

const { api } = await import("../src/lib/api.js");

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

beforeEach(() => {
  push.mockClear();
  api.get.mockReset();
});

describe("FlagsPage", () => {
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
});
