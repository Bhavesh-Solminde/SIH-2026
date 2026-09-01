import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "../src/app/login/page.jsx";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../src/lib/api.js", () => ({
  api: { post: vi.fn() },
  ApiError: class extends Error {},
}));
const { api } = await import("../src/lib/api.js");

beforeEach(() => {
  push.mockClear();
  api.post.mockReset();
});

describe("LoginPage", () => {
  it("signs in and routes to rates on success", async () => {
    api.post.mockResolvedValue({ recycler: { name: "Bharat E Waste" } });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bharat@bhaav.demo" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "bhaav-demo-2026" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/login", {
      email: "bharat@bhaav.demo",
      password: "bhaav-demo-2026",
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/rates"));
  });

  it("shows an error and does not route on bad credentials", async () => {
    api.post.mockRejectedValue(new Error("invalid_credentials"));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "x@y.z" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
