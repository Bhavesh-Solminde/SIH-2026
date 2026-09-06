"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

// A browser camera can fail on stage — permission denied, no device,
// non-secure origin, bad lighting. This component is the fast path
// (scan); the manual reference-code input beside it in verify/page.jsx
// is the guaranteed path and keeps working no matter what happens here.
// See test/QrScanner.test.jsx for the test that proves that survives.
//
// Two demo-safety rules enforced below:
//  - never start the camera on mount — only on an explicit click
//  - stop and release the camera on unmount and right after a decode

const CAMERA_CONFIG = { fps: 10, qrbox: 220 };

function readableError(err) {
  const text = typeof err === "string" ? err : err?.message ?? String(err ?? "");
  if (/notallowed|permission/i.test(text)) {
    return "Camera permission denied. Type the reference code below instead.";
  }
  if (/notfound|no camera|overconstrained/i.test(text)) {
    return "No camera found on this device. Type the reference code below instead.";
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
      const instance = new Html5Qrcode(readerId);
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
    }
  }

  if (!active) return null;

  return (
    <div style={{ marginBottom: "1rem" }}>
      {!hasCameraApi && (
        <p style={{ color: "var(--c-muted)", fontSize: ".85rem", marginBottom: ".5rem" }}>
          Camera not available in this browser. Type the reference code below.
        </p>
      )}

      {hasCameraApi && status !== "scanning" && (
        <button
          type="button"
          onClick={handleStart}
          disabled={status === "starting"}
          style={{ width: "100%", padding: ".6rem", fontSize: ".95rem", justifyContent: "center", marginBottom: ".5rem" }}
        >
          {status === "starting" ? "Starting camera…" : "📷 Scan QR"}
        </button>
      )}

      {hasCameraApi && status === "scanning" && (
        <button
          type="button"
          onClick={stopScanner}
          style={{ width: "100%", padding: ".6rem", fontSize: ".95rem", justifyContent: "center", marginBottom: ".5rem" }}
        >
          Stop Scanning
        </button>
      )}

      <div
        id={readerId}
        style={status === "scanning" ? { width: "100%" } : { display: "none" }}
      />

      {errorMessage && (
        <p role="alert" style={{ fontSize: ".85rem", marginTop: ".4rem" }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
