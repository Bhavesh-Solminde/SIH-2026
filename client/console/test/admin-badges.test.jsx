import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../src/lib/useSession.js", () => ({
  useAdminSession: () => ({ email: "admin@bhaav.demo", role: "ADMIN" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/admin/badges" }));
vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  ApiError: class extends Error {},
}));

const { api } = await import("../src/lib/api.js");
const AdminBadgesPage = (await import("../src/app/(protected)/admin/badges/page.jsx")).default;

beforeEach(() => vi.clearAllMocks());

const RECYCLERS = {
  recyclers: [
    { id: "b8789dd3-1f97-4530-9474-799bdd832e6f", name: "Global E-Recycling Pvt Ltd Plot No 2", district: "Thane", badge_revoked: false },
    { id: "4e0dcfea-0000-0000-0000-000000000000", name: "Lilashana Sales", district: "Palghar", badge_revoked: true },
  ],
};

describe("AdminBadgesPage", () => {
  it("renders verified recyclers with their badge state", async () => {
    api.get.mockResolvedValue(RECYCLERS);

    render(<AdminBadgesPage />);

    expect(await screen.findByText(/Global E-Recycling/)).toBeInTheDocument();
    expect(screen.getByText(/Lilashana Sales/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/recyclers/verified");
  });

  it("shows the empty state when there are no verified recyclers", async () => {
    api.get.mockResolvedValue({ recyclers: [] });

    render(<AdminBadgesPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(await screen.findByText(/no mpcb-verified recyclers/i)).toBeInTheDocument();
  });

  it("revoking an active badge calls PATCH with revoked: true and flips the label", async () => {
    api.get.mockResolvedValue(RECYCLERS);
    api.patch.mockResolvedValue({ id: RECYCLERS.recyclers[0].id, badge_revoked: true });

    render(<AdminBadgesPage />);
    await screen.findByText(/Global E-Recycling/);

    const revokeButtons = screen.getAllByRole("button", { name: /revoke/i });
    fireEvent.click(revokeButtons[0]);

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      `/recyclers/${RECYCLERS.recyclers[0].id}/badge`, { revoked: true },
    ));
  });

  it("restoring a revoked badge calls PATCH with revoked: false", async () => {
    api.get.mockResolvedValue(RECYCLERS);
    api.patch.mockResolvedValue({ id: RECYCLERS.recyclers[1].id, badge_revoked: false });

    render(<AdminBadgesPage />);
    await screen.findByText(/Lilashana Sales/);

    fireEvent.click(screen.getByRole("button", { name: /restore/i }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      `/recyclers/${RECYCLERS.recyclers[1].id}/badge`, { revoked: false },
    ));
  });
});
