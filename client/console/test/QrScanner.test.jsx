import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QrScanner from "../src/components/QrScanner.jsx";
import VerifyPage from "../src/app/(protected)/verify/page.jsx";

// html5-qrcode touches real hardware (camera + MediaStream). Mock the whole
// module — no test here ever talks to an actual device.
const startMock = vi.fn();
const stopMock = vi.fn();
const clearMock = vi.fn();

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: vi.fn().mockImplementation(function Html5QrcodeMock() {
    this.isScanning = true;
    this.start = startMock;
    this.stop = stopMock;
    this.clear = clearMock;
  }),
}));

// verify/page.jsx needs useSearchParams, and Nav (rendered by the page)
// needs useRouter — a partial mock throws "No <hook> export is defined"
// before either test reaches an assertion, so both plus usePathname are
// provided here, same as verify.test.jsx.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/verify",
}));

vi.mock("../src/lib/api.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  ApiError: class extends Error {},
}));

vi.mock("../src/lib/useSession.js", () => ({
  useSession: () => ({ id: "r1", name: "Test Recycler" }),
}));

const { api } = await import("../src/lib/api.js");

function withCamera() {
  Object.defineProperty(window.navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  });
}

function withoutCamera() {
  Object.defineProperty(window.navigator, "mediaDevices", {
    value: undefined,
    configurable: true,
  });
}

beforeEach(() => {
  startMock.mockReset();
  stopMock.mockReset().mockResolvedValue(undefined);
  clearMock.mockReset();
  api.get.mockReset();
  api.post.mockReset();
  withCamera();
});

describe("QrScanner", () => {
  it("renders a Scan QR control when the browser reports a camera", () => {
    render(<QrScanner onScan={vi.fn()} />);
    expect(screen.getByRole("button", { name: /scan qr/i })).toBeInTheDocument();
  });

  it("calls onScan with the decoded text and stops the scanner after the first successful decode", async () => {
    startMock.mockImplementation((cameraConfig, config, onSuccess) => {
      onSuccess("REF12345");
      return Promise.resolve(null);
    });
    const onScan = vi.fn();
    render(<QrScanner onScan={onScan} />);

    fireEvent.click(screen.getByRole("button", { name: /scan qr/i }));

    await waitFor(() => expect(onScan).toHaveBeenCalledWith("REF12345"));
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a permission failure as readable text rather than a blank panel", async () => {
    startMock.mockRejectedValue(new Error("NotAllowedError"));
    render(<QrScanner onScan={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /scan qr/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/camera/i);
  });

  it("keeps the manual reference input present and usable after the scanner errors — demo-safety: camera failure must never block the typed fallback", async () => {
    startMock.mockRejectedValue(new Error("NotAllowedError"));
    api.get.mockResolvedValue({
      lot: { id: "lot-xyz", categoryCode: "PCB", quantity: 1, unit: "KG", condition: "GOOD" },
    });

    render(<VerifyPage />);

    // Trigger the camera path and let it fail.
    fireEvent.click(screen.getByRole("button", { name: /scan qr/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // The manual input must still be there, enabled, and wired to the same lookup.
    const input = screen.getByPlaceholderText(/e\.g\. a1b2c3d4/i);
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();

    fireEvent.change(input, { target: { value: "LOT-XYZ" } });
    fireEvent.click(screen.getByRole("button", { name: /look up lot/i }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/lots/LOT-XYZ"));
  });

  it("degrades to a readable message when navigator.mediaDevices is unavailable", () => {
    withoutCamera();
    render(<QrScanner onScan={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /scan qr/i })).not.toBeInTheDocument();
    expect(screen.getByText(/camera/i)).toBeInTheDocument();
  });
});
