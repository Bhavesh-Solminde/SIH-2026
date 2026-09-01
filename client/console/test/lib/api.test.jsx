import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../../src/lib/api.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("api", () => {
  it("sends credentials so the session cookie rides along", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });
    await api.get("/recycler/rates");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4000/recycler/rates",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("posts json with the content-type header", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await api.post("/recycler/rates", { rates: [] });
    const [, opts] = fetch.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(opts.headers["content-type"]).toBe("application/json");
    expect(opts.body).toBe(JSON.stringify({ rates: [] }));
  });

  it("throws an ApiError carrying the status on a non-ok response", async () => {
    fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthorised" }) });
    await expect(api.get("/auth/me")).rejects.toBeInstanceOf(ApiError);
    await expect(api.get("/auth/me")).rejects.toMatchObject({ status: 401 });
  });
});
