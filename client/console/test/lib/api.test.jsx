import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../../src/lib/api.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("api", () => {
  it("sends credentials so the session cookie rides along", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });
    await api.get("/recycler/rates");
    // api.js:3 routes everything through the Next.js rewrite (/api/* →
    // Express :4000/*) so requests are same-origin from the browser's POV —
    // no CORS needed, and the httpOnly session cookie rides along on the
    // rewritten same-origin request. BASE moved from an absolute
    // "http://localhost:4000" origin to "/api" in commit 2ac75d4 for exactly
    // this reason; this test still asserted the old absolute URL.
    expect(fetch).toHaveBeenCalledWith(
      "/api/recycler/rates",
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
