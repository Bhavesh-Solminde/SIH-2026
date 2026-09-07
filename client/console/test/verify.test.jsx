import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import VerifyPage from "../src/app/(protected)/verify/page.jsx";

// Mock navigation (used by Nav and useSession).
// The page uses useSearchParams (verify/page.jsx:30) and Nav uses useRouter.
// A partial mock of next/navigation throws "No <hook> export is defined",
// which is why these four never got as far as their assertions.
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/verify",
}));

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

// Shape matches what verify/page.jsx actually reads off a lot (page.jsx:166,
// 171, 175, 182, 187): categoryCode (falls back from category.nameEn/code),
// quantity + unit, condition, accepted_rate/accepted_unit, estimated_value.
const MOCK_LOT = {
  id: "lot-abc",
  reference_code: "LOT-2026-001",
  categoryCode: "PCB",
  quantity: 5,
  unit: "KG",
  condition: "GOOD",
  accepted_rate: 420,
  accepted_unit: "KG",
  estimated_value: 2100,
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

    const input = screen.getByPlaceholderText(/e\.g\. a1b2c3d4/i);
    fireEvent.change(input, { target: { value: "LOT-2026-001" } });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/lots/LOT-2026-001")
    );
  });

  it("shows lot details — category, quantity, condition — after a successful scan", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    render(<VerifyPage />);

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. a1b2c3d4/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));

    await waitFor(() => expect(screen.getByText("PCB")).toBeInTheDocument());
    // Scoped to the Lot Details card: the inspection form beside it now
    // echoes "5 KG x rate" in its running total, so an unscoped query for
    // the quantity matches in both places.
    const details = within(screen.getByText("Lot Details").closest(".card"));
    expect(details.getByText(/5 KG/)).toBeInTheDocument();
    // Collector-reported condition, shown as a badge (page.jsx:175).
    expect(details.getByText("GOOD")).toBeInTheDocument();
  });

  it("submits the handover with the inspected condition and the grade-derived final price", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    api.post.mockResolvedValue({ handover: { id: "h1", lot_id: "lot-abc" } });
    render(<VerifyPage />);

    // Phase 1: scan
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. a1b2c3d4/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));
    await waitFor(() => expect(screen.getByText("PCB")).toBeInTheDocument());

    // Phase 2: select condition (matches the collector's own — no downgrade
    // reason required) and submit
    fireEvent.click(screen.getByRole("button", { name: /good/i }));
    // The submit button is disabled until the price field holds a valid
    // number, and that field is populated by an effect. Waiting for the lot
    // to render does not prove the effect has run, so clicking straight
    // through is a silent no-op whenever the effect lands a tick later.
    await waitFor(() =>
      expect(screen.getByLabelText(/price per kg/i)).toHaveValue(420)
    );
    fireEvent.click(screen.getByRole("button", { name: /send to collector/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/handover", {
        lot_id: "lot-abc",
        inspected_condition: "GOOD",
        // Seeded from the accepted rate at the GOOD factor (420 x 1.0).
        final_unit_price: 420,
      })
    );
  });

  it("sends the price the recycler typed, not the grade-derived one, when they override it", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    api.post.mockResolvedValue({ handover: { id: "h1", lot_id: "lot-abc" } });
    render(<VerifyPage />);

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. a1b2c3d4/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));
    await waitFor(() => expect(screen.getByText("PCB")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /good/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/price per kg/i)).toHaveValue(420)
    );
    fireEvent.change(screen.getByLabelText(/price per kg/i), { target: { value: "385.50" } });
    fireEvent.click(screen.getByRole("button", { name: /send to collector/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/handover", {
        lot_id: "lot-abc",
        inspected_condition: "GOOD",
        final_unit_price: 385.5,
      })
    );
  });

  it("fills the price field from the collector's accepted rate when that suggestion is used", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    api.post.mockResolvedValue({ handover: { id: "h1", lot_id: "lot-abc" } });
    render(<VerifyPage />);

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. a1b2c3d4/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));
    await waitFor(() => expect(screen.getByText("PCB")).toBeInTheDocument());

    // FAIR would otherwise derive 420 x 0.85 = 357; the suggestion overrides it.
    fireEvent.click(screen.getByRole("button", { name: /fair/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/price per kg/i)).toHaveValue(357)
    );

    fireEvent.click(screen.getByRole("button", { name: /collector's accepted rate/i }));

    expect(screen.getByLabelText(/price per kg/i)).toHaveValue(420);
  });

  it("waits for the collector rather than offering to sign on their behalf, and shows the amount awaiting signature", async () => {
    api.get.mockResolvedValue({ lot: MOCK_LOT });
    api.post.mockResolvedValue({
      handover: {
        id: "h1", lot_id: "lot-abc", reference_code: "LOT-2026-001",
        status: "PENDING_COLLECTOR", inspected_condition: "GOOD",
        final_unit_price: 420, final_total: 2100,
      },
    });

    render(<VerifyPage />);

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. a1b2c3d4/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));
    await waitFor(() => expect(screen.getByText("PCB")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /good/i }));
    // The submit button is disabled until the price field holds a valid
    // number, and that field is populated by an effect. Waiting for the lot
    // to render does not prove the effect has run, so clicking straight
    // through is a silent no-op whenever the effect lands a tick later.
    await waitFor(() =>
      expect(screen.getByLabelText(/price per kg/i)).toHaveValue(420)
    );
    fireEvent.click(screen.getByRole("button", { name: /send to collector/i }));

    await waitFor(() =>
      expect(screen.getByText(/awaiting collector signature/i)).toBeInTheDocument()
    );

    // The two-sided signature is enforced in the database; the console must
    // not offer a way for one party to supply both halves of it.
    expect(
      screen.queryByRole("button", { name: /on behalf of collector/i })
    ).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith("/handover/lot-abc/confirm");

    // The recycler still needs to see what is on the table while they wait.
    expect(screen.getByText("₹2,100")).toBeInTheDocument();
  });

  it("shows the existing handover instead of the inspection form when the lot was already inspected", async () => {
    api.get.mockImplementation((path) => {
      if (path.startsWith("/lots/")) return Promise.resolve({ lot: MOCK_LOT });
      return Promise.resolve({
        handover: {
          handover_id: "h1", lot_id: "lot-abc", reference_code: "LOT-2026-001",
          status: "PENDING_COLLECTOR", inspected_condition: "FAIR",
          final_unit_price: 357, final_total: 1785,
        },
      });
    });

    render(<VerifyPage />);

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. a1b2c3d4/i), {
      target: { value: "LOT-2026-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));

    // Reloading a lot that is already past inspection used to re-offer the
    // form and fail with handover_already_exists only on submit.
    await waitFor(() =>
      expect(screen.getByText(/awaiting collector signature/i)).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: /send to collector/i })
    ).not.toBeInTheDocument();
  });
});
