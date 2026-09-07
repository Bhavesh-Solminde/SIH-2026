"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import Icon from "./Icon.jsx";

// A browser camera can fail on stage — permission denied, no device,
// non-secure origin, bad lighting. This component is the fast path
// (scan); the manual reference-code input beside it in verify/page.jsx
// is the guaranteed path and keeps working no matter what happens here.
// See test/QrScanner.test.jsx for the test that proves that survives.
//
// Two demo-safety rules enforced below:
//  - never start the camera on mount — only on an explicit click
//  - stop and release the camera on unmount and right after a decode
//
// Why the reader div is always in the layout, never `display: none`:
// html5-qrcode measures its container when start() is called, and derives
// both the video element's size and the scan region from that measurement.
// A container that is display:none measures 0×0, so the library sized its
// scan box against nothing — the camera light came on and no code ever
// decoded, with no error to explain it. The container now always occupies
// real space (collapsed to a thin placeholder when idle), so by the time
// start() measures it there is something to measure.

// qrbox as a function so the scan region tracks the actual video box the
// browser gave us, instead of a fixed 220px that can exceed a narrow frame
// (an oversized qrbox is silently ignored, taking the framing guide with it).
function qrbox(viewfinderWidth, viewfinderHeight) {
  const smaller = Math.min(viewfinderWidth, viewfinderHeight);
  const size = Math.max(160, Math.floor(smaller * 0.7));
  return { width: size, height: size };
}

// QR_CODE is 0, so this has to test for undefined rather than truthiness.
const QR_ONLY = Html5QrcodeSupportedFormats?.QR_CODE !== undefined
  ? [Html5QrcodeSupportedFormats.QR_CODE]
  : undefined;

const CAMERA_CONFIG = {
  fps: 12,
  qrbox,
  aspectRatio: 1.0,
  // Only look for QR codes. Leaving every barcode format enabled spends the
  // per-frame decode budget on symbologies this app never issues.
  formatsToSupport: QR_ONLY,
  // Use the browser's own detector when it has one — markedly faster and
  // more tolerant of angle and low light than the JS fallback.
  experimentalFeatures: { useBarCodeDetectorIfSupported: true },
};

function readableError(err) {
  const text = typeof err === "string" ? err : err?.message ?? String(err ?? "");
  if (/notallowed|permission/i.test(text)) {
    return "Camera permission denied. Type the reference code below instead.";
  }
  if (/notfound|no camera|overconstrained/i.test(text)) {
    return "No camera found on this device. Type the reference code below instead.";
  }
  if (/secure|https/i.test(text)) {
    return "The camera needs a secure (https) connection. Type the reference code below instead.";
  }
  return "Could not start the camera. Type the reference code below instead.";
}

export default function QrScanner({ onScan, onError, active = true }) {
  const rawId = useId();
  const readerId = `qr-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const scannerRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | starting | scanning | error
  const [errorMessage, setErrorMessage] = useState(null);

  const hasCameraApi =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";

  async function stopScanner() {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (!instance) return;
    try {
      if (instance.isScanning) await instance.stop();
    } catch {
      // best-effort — never let a stop failure block the UI
    }
    try {
      instance.clear?.();
    } catch {
      // ignore
    }
    setStatus((s) => (s === "scanning" || s === "starting" ? "idle" : s));
  }

  // Release the camera on unmount. This effect does NOT start anything.
  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the parent marks this scanner inactive (e.g. a lot was found and
  // phase 1 is no longer showing), release the camera immediately.
  useEffect(() => {
    if (!active) stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function handleStart() {
    setErrorMessage(null);
    setStatus("starting");
    try {
      const instance = new Html5Qrcode(readerId, {
        formatsToSupport: CAMERA_CONFIG.formatsToSupport,
        experimentalFeatures: CAMERA_CONFIG.experimentalFeatures,
        verbose: false,
      });
      scannerRef.current = instance;
      await instance.start(
        { facingMode: "environment" },
        CAMERA_CONFIG,
        (decodedText) => {
          stopScanner();
          onScan?.(decodedText);
        },
        () => {
          // per-frame decode misses while aiming — not an error
        }
      );
      setStatus("scanning");
    } catch (err) {
      const message = readableError(err);
      setStatus("error");
      setErrorMessage(message);
      onError?.(message);
      await stopScanner();
      setStatus("error");
    }
  }

  if (!active) return null;

  const live = status === "scanning" || status === "starting";

  return (
    <div className="qr-scanner">
      {!hasCameraApi && (
        <p style={{ color: "var(--c-muted)", fontSize: ".85rem", marginBottom: ".5rem" }}>
          Camera not available in this browser. Type the reference code below.
        </p>
      )}

      {/* The camera view. Always mounted and always sized, so html5-qrcode
          has a real box to measure; the idle state just shows a short
          placeholder in the same slot instead of collapsing it. */}
      <div className={`qr-frame${live ? " live" : ""}`}>
        <div id={readerId} className="qr-reader" />
        {live && <div className="qr-guide" aria-hidden="true" />}
        {!live && (
          <div className="qr-placeholder">
            <Icon name="camera" size={26} />
            <span>Point at the collector&apos;s QR code, then press Scan QR</span>
          </div>
        )}
        {status === "starting" && <div className="qr-status">Starting camera…</div>}
        {status === "scanning" && <div className="qr-status">Line the code up inside the box</div>}
      </div>

      {hasCameraApi && !live && (
        <button
          type="button"
          onClick={handleStart}
          style={{ width: "100%", padding: ".6rem", fontSize: ".95rem", justifyContent: "center", marginBottom: ".5rem" }}
        >
          <Icon name="camera" size={16} /> Scan QR
        </button>
      )}

      {hasCameraApi && live && (
        <button
          type="button"
          className="secondary"
          onClick={stopScanner}
          style={{ width: "100%", padding: ".6rem", fontSize: ".95rem", justifyContent: "center", marginBottom: ".5rem" }}
        >
          Stop Scanning
        </button>
      )}

      {errorMessage && (
        <p role="alert" style={{ fontSize: ".85rem", marginTop: ".4rem" }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
