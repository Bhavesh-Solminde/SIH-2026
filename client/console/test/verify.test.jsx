import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VerifyPage from "../src/app/(protected)/verify/page.jsx";

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

const MOCK_LOT = {
  id: "lot-abc",
  reference_code: "LOT-2026-001",
  category: "PCB",
  quantity: 5,
  unit: "KG",
  condition: "GOOD",
  estimated_value: 2100,
  photos: [],
};

beforeEach(() => {
  push.mockClear();
  api.get.mockReset();
  api.post.mockReset();
});

describe("VerifyPage", () => {
  it("renders the scan form and calls GET /lots/:ref on submit", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    render(<VerifyPage />);

    const input = screen.getByPlaceholderText(/scan qr code/i);
    fireEvent.change(input, { target: { value: "LOT-2026-001" } });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/lots/LOT-2026-001")
    );
  });

  it("shows lot details — category, quantity, condition — after a successful scan", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    render(<VerifyPage />);

    fireEvent.change(screen.getByPlaceholderText(/scan qr code/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));

    await waitFor(() => expect(screen.getByText("PCB")).toBeInTheDocument());
    // quantity with unit
    expect(screen.getByText(/5/)).toBeInTheDocument();
    // "GOOD" appears in the collector-condition dd; use getAllByText since it
    // also appears in the inspected-condition radio buttons
    const goodEls = screen.getAllByText("GOOD");
    expect(goodEls.length).toBeGreaterThanOrEqual(1);
  });

  it("submits the handover form and calls POST /handover with correct body", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    api.post.mockResolvedValue({ handover: { id: "h1", lot_id: "lot-abc" } });
    render(<VerifyPage />);

    // Phase 1: scan
    fireEvent.change(screen.getByPlaceholderText(/scan qr code/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));
    await waitFor(() => expect(screen.getByText("PCB")).toBeInTheDocument());

    // Phase 2: select condition and submit
    fireEvent.click(screen.getByLabelText("GOOD"));
    fireEvent.click(screen.getByRole("button", { name: /send to collector/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/handover", {
        lot_id: "lot-abc",
        inspected_condition: "GOOD",
      })
    );
  });

  it("shows collector confirmation prompt and calls POST /handover/:lot_id/confirm on confirm", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    api.post
      .mockResolvedValueOnce({ handover: { id: "h1", lot_id: "lot-abc" } })
      .mockResolvedValueOnce({ final_price: 2100, handover: { final_price: 2100 } });

    render(<VerifyPage />);

    // Phase 1: scan
    fireEvent.change(screen.getByPlaceholderText(/scan qr code/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));
    await waitFor(() => expect(screen.getByText("PCB")).toBeInTheDocument());

    // Phase 2: submit handover
    fireEvent.click(screen.getByLabelText("GOOD"));
    fireEvent.click(screen.getByRole("button", { name: /send to collector/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument()
    );

    // Phase 3: confirm
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/handover/lot-abc/confirm")
    );
  });
});
