import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/rates" }));
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ApiError: class extends Error {},
}));

const { api } = await import("../src/lib/api.js");
const Nav = (await import("../src/components/Nav.jsx")).default;

beforeEach(() => vi.clearAllMocks());

describe("Nav — MPCB verified badge", () => {
  it("shows the green badge when the recycler session is mpcbVerified: true", async () => {
    api.get.mockResolvedValue({ id: "r1", name: "Test Recycler", role: "RECYCLER", mpcbVerified: true });

    render(<Nav />);

    expect(await screen.findByText(/MPCB Verified/i)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/auth/me");
  });

  it("shows no badge when mpcbVerified is false (lapsed or revoked)", async () => {
    api.get.mockResolvedValue({ id: "r1", name: "Test Recycler", role: "RECYCLER", mpcbVerified: false });

    render(<Nav />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/auth/me"));
    expect(screen.queryByText(/MPCB Verified/i)).not.toBeInTheDocument();
  });

  it("never fetches /auth/me for the ADMIN nav — no badge concept there", async () => {
    render(<Nav role="ADMIN" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByText(/MPCB Verified/i)).not.toBeInTheDocument();
  });
});
