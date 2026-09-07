import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSms, smsEnabled } from "../src/lib/sms.js";

const OLD = { ...process.env };

beforeEach(() => {
  process.env.FAST2SMS_API_KEY = "test-key";
  process.env.SMS_ENABLED = "true";
  process.env.SMS_DRY_RUN = "false";
  delete process.env.SMS_ALLOWLIST;
  // Both routing vars must be cleared, not just the allowlist: the repo's .env
  // sets SMS_REDIRECT_TO for demo builds, and an ambient value would silently
  // rewrite the destination every assertion below depends on.
  delete process.env.SMS_REDIRECT_TO;
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...OLD };
});

describe("sendSms", () => {
  it("is disabled unless SMS_ENABLED is explicitly true", async () => {
    // Default-off matters: the 155 seeded numbers are real businesses on a
    // government register. An accidental broadcast is a real-world harm.
    process.env.SMS_ENABLED = "false";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(smsEnabled()).toBe(false);
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends via route=q with the key in the Authorization header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ return: true, request_id: "abc" }),
    });

    const res = await sendSms({ numbers: "9999999999", message: "hello" });

    expect(res.ok).toBe(true);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("https://www.fast2sms.com/dev/bulkV2");
    expect(String(url)).toContain("route=q");
    expect(String(url)).toContain("numbers=9999999999");
    expect(opts.headers.Authorization).toBe("test-key");
    expect(opts.headers.Authorization).not.toContain("Bearer");
  });

  it("sends to nobody outside the allowlist when one is set", async () => {
    // The single most important guard while building: point SMS_ALLOWLIST at
    // your own phone and an accidental broadcast becomes structurally impossible.
    process.env.SMS_ALLOWLIST = "8888888888";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ return: true }),
    });

    const res = await sendSms({ numbers: "9999999999,8888888888", message: "hi" });

    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("numbers=8888888888");
    expect(String(url)).not.toContain("9999999999");
    expect(res.ok).toBe(true);
  });

  it("returns ok:false and sends nothing when every number is filtered out", async () => {
    process.env.SMS_ALLOWLIST = "8888888888";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails open on a network error rather than throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.ok).toBe(false);
    expect(res.reason).toContain("ECONNREFUSED");
  });

  it("fails open on a non-200 rather than throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 401, json: async () => ({ message: "unauthorized" }),
    });

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.ok).toBe(false);
    expect(res.reason).toContain("401");
  });

  it("does not call the network in dry-run but reports ok", async () => {
    process.env.SMS_DRY_RUN = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never puts the api key in the returned reason", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom test-key leaked"));

    const res = await sendSms({ numbers: "9999999999", message: "hi" });

    expect(res.reason).not.toContain("test-key");
  });

  it("redirects every recipient to SMS_REDIRECT_TO when it is set", async () => {
    // Demo builds cannot text the seeded MPCB numbers, so the whole
    // collector->recycler direction is unreachable without this redirect.
    process.env.SMS_REDIRECT_TO = "9653158855";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ return: true }),
    });

    const res = await sendSms({ numbers: "9833542199,9822334455", message: "hi" });

    const [url] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("numbers=9653158855");
    expect(String(url)).not.toContain("9833542199");
    expect(res.to).toEqual(["9653158855"]);
  });

  it("cannot use SMS_REDIRECT_TO to reach a number the allowlist rejects", async () => {
    // The redirect is routing, not a fourth safety guard. It runs before the
    // allowlist precisely so the allowlist keeps the last word.
    process.env.SMS_REDIRECT_TO = "9999999999";
    process.env.SMS_ALLOWLIST = "9653158855";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendSms({ numbers: "9833542199", message: "hi" });

    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not invent a recipient when there are no numbers to redirect", async () => {
    process.env.SMS_REDIRECT_TO = "9653158855";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendSms({ numbers: "", message: "hi" });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("no numbers");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
