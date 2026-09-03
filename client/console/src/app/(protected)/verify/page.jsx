"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "../../../components/Nav.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { rupees } from "../../../lib/format.js";

const CONDITIONS = [
  { code: "GOOD", label: "Good",  icon: "✅", color: "#155724", bg: "#d4edda", border: "#28a745" },
  { code: "FAIR", label: "Fair",  icon: "⚠️", color: "#856404", bg: "#fff3cd", border: "#ffc107" },
  { code: "POOR", label: "Poor",  icon: "❌", color: "#721c24", bg: "#f8d7da", border: "#dc3545" },
];

const DOWNGRADE_REASONS = [
  { code: "POOR_CONDITION",      label: "Poor condition after inspection" },
  { code: "MIXED_GRADE",         label: "Mixed grade / quality" },
  { code: "LOW_RECOVERABLE",     label: "Low recoverable content" },
  { code: "TRANSPORT_DISTANCE",  label: "Transport distance premium" },
  { code: "BULK_DISCOUNT",       label: "Bulk discount applied" },
  { code: "LOCAL_RATE_LOWER",    label: "Local market rate lower" },
  { code: "OTHER",               label: "Other" },
];

const DT_STYLE = { fontSize: ".78rem", color: "var(--c-muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".2rem" };
const DD_STYLE = { fontWeight: "600", fontSize: ".95rem" };

export default function VerifyPage() {
  const recycler = useSession();
  const searchParams = useSearchParams();

  const [refCode, setRefCode]                     = useState(searchParams.get("ref") ?? "");
  const [lot, setLot]                             = useState(null);
  const [scanError, setScanError]                 = useState(null);
  const [scanning, setScanning]                   = useState(false);

  const [inspectedCondition, setInspectedCondition]   = useState("");
  const [downgradeReasonCode, setDowngradeReasonCode] = useState("");
  const [handoverError, setHandoverError]             = useState(null);
  const [submitting, setSubmitting]                   = useState(false);

  const [handover, setHandover]     = useState(null);
  const [confirmError, setConfirmError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed]   = useState(null);

  async function lookupRef(code) {
    if (!code?.trim()) return;
    setScanError(null);
    setScanning(true);
    try {
      const result = await api.get(`/lots/${code.trim()}`);
      const l = result.lot ?? result;
      setLot(l);
      setInspectedCondition(l.condition ?? "");
    } catch (err) {
      setScanError(err.body?.error === "not_found" ? "Lot not found — check the reference code." : (err.message ?? "Lot not found"));
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) lookupRef(ref);
  }, []);

  async function handleScan(e) {
    e.preventDefault();
    lookupRef(refCode);
  }

  async function handleHandover(e) {
    e.preventDefault();
    setHandoverError(null);
    setSubmitting(true);
    try {
      const body = { lot_id: lot.id, inspected_condition: inspectedCondition };
      if (downgradeReasonCode && inspectedCondition !== lot.condition) body.downgrade_reason_code = downgradeReasonCode;
      const result = await api.post("/handover", body);
      setHandover(result.handover ?? result);
    } catch (err) {
      setHandoverError(err.message ?? "Handover failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    setConfirmError(null);
    setConfirming(true);
    try {
      const result = await api.post(`/handover/${lot.id}/confirm`);
      setConfirmed(result);
    } catch (err) {
      setConfirmError(err.message ?? "Confirmation failed");
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setRefCode(""); setLot(null); setScanError(null);
    setHandover(null); setConfirmed(null);
    setInspectedCondition(""); setDowngradeReasonCode("");
    setHandoverError(null); setConfirmError(null);
  }

  if (!recycler) return null;

  const condBadgeClass = (c) => c === "GOOD" ? "badge-ok" : c === "FAIR" ? "badge-warn" : "badge-danger";

  return (
    <>
      <Nav />
      <main>
        <h1>Verify &amp; Sign</h1>

        {/* ── Phase 4: Confirmed ─────────────────────────────────────────── */}
        {confirmed && (
          <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🤝</div>
            <h2 style={{ color: "var(--c-primary)", fontSize: "1.5rem", marginBottom: ".5rem" }}>
              Handover Confirmed
            </h2>
            <p style={{ color: "var(--c-muted)", marginBottom: "1.5rem" }}>
              Ref: <code style={{ background: "#f1f3f5", padding: ".1rem .4rem", borderRadius: "4px" }}>{lot?.reference_code}</code>
            </p>
            <div style={{ fontSize: "2.75rem", fontWeight: "800", color: "var(--c-primary)", marginBottom: "2rem" }}>
              {rupees(confirmed.final_price ?? confirmed.handover?.final_price)}
            </div>
            <button type="button" onClick={reset}>Scan another lot</button>
          </div>
        )}

        {/* ── Phase 3: Awaiting collector ────────────────────────────────── */}
        {!confirmed && handover && (
          <div className="card">
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.5rem" }}>
              <span style={{ fontSize: "2.5rem", lineHeight: 1 }}>⏳</span>
              <div>
                <h2 style={{ marginBottom: ".3rem" }}>Awaiting Collector Signature</h2>
                <p style={{ color: "var(--c-muted)", fontSize: ".9rem", lineHeight: 1.5 }}>
                  The collector will see a confirmation request on their device.<br />
                  Once they agree, the handover is locked.
                </p>
              </div>
            </div>
            {confirmError && <p role="alert">{confirmError}</p>}
            <button type="button" onClick={handleConfirm} disabled={confirming} style={{ width: "100%", padding: ".7rem", fontSize: "1rem", justifyContent: "center" }}>
              {confirming ? "Confirming…" : "✓ Confirm on behalf of collector"}
            </button>
          </div>
        )}

        {/* ── Phase 2: Lot details + inspection form ─────────────────────── */}
        {!handover && lot && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", alignItems: "start" }}>

            {/* Lot details */}
            <div className="card">
              <h2 style={{ marginBottom: "1rem" }}>Lot Details</h2>
              <div style={{ display: "grid", rowGap: "1rem" }}>
                <div>
                  <div style={DT_STYLE}>Category</div>
                  <div style={DD_STYLE}>{lot.category?.nameEn ?? lot.category?.code ?? lot.categoryCode ?? "—"}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <div style={DT_STYLE}>Quantity</div>
                    <div style={DD_STYLE}>{lot.quantity} {lot.unit}</div>
                  </div>
                  <div>
                    <div style={DT_STYLE}>Collector Condition</div>
                    <span className={`badge ${condBadgeClass(lot.condition)}`}>{lot.condition}</span>
                  </div>
                </div>
                {lot.accepted_rate != null && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <div style={DT_STYLE}>Accepted Rate</div>
                      <div style={DD_STYLE}>{rupees(lot.accepted_rate)} / {lot.accepted_unit ?? lot.unit}</div>
                    </div>
                    <div>
                      <div style={DT_STYLE}>Estimated Value</div>
                      <div style={{ ...DD_STYLE, fontSize: "1.2rem", color: "var(--c-primary)" }}>
                        {rupees(lot.estimated_value ?? lot.estimatedValue)}
                      </div>
                    </div>
                  </div>
                )}
                {lot.collector && (
                  <div>
                    <div style={DT_STYLE}>Collector ID</div>
                    <div style={{ ...DD_STYLE, fontFamily: "monospace", fontSize: ".85rem" }}>{lot.collector.pseudonym}…</div>
                  </div>
                )}
              </div>
            </div>

            {/* Inspection form */}
            <div className="card">
              <h2 style={{ marginBottom: ".4rem" }}>Physical Inspection</h2>
              <p style={{ color: "var(--c-muted)", fontSize: ".85rem", marginBottom: "1.25rem" }}>
                Select the condition after physical inspection
              </p>

              <form onSubmit={handleHandover}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".6rem", marginBottom: "1.25rem" }}>
                  {CONDITIONS.map((c) => {
                    const selected = inspectedCondition === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setInspectedCondition(c.code)}
                        style={{
                          padding: "1rem .5rem",
                          borderRadius: "8px",
                          border: `2px solid ${selected ? c.border : "var(--c-border)"}`,
                          background: selected ? c.bg : "var(--c-surface)",
                          color: selected ? c.color : "var(--c-muted)",
                          fontWeight: "700",
                          fontSize: ".9rem",
                          cursor: "pointer",
                          transition: "all .15s",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: ".35rem",
                        }}
                      >
                        <span style={{ fontSize: "1.4rem" }}>{c.icon}</span>
                        {c.label}
                      </button>
                    );
                  })}
                </div>

                {inspectedCondition && inspectedCondition !== lot.condition && (
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: ".85rem", fontWeight: "500", marginBottom: ".35rem", color: "var(--c-warn)" }}>
                      ⚠️ Downgrade reason required
                    </label>
                    <select value={downgradeReasonCode} onChange={(e) => setDowngradeReasonCode(e.target.value)} required>
                      <option value="">— select reason —</option>
                      {DOWNGRADE_REASONS.map((r) => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {handoverError && <p role="alert" style={{ marginBottom: ".75rem" }}>{handoverError}</p>}

                <button
                  type="submit"
                  disabled={!inspectedCondition || submitting}
                  style={{ width: "100%", padding: ".7rem", fontSize: "1rem", justifyContent: "center", marginTop: ".25rem" }}
                >
                  {submitting ? "Submitting…" : "Send to Collector →"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── Phase 1: Scan / lookup ─────────────────────────────────────── */}
        {!lot && (
          <div style={{ maxWidth: "440px", margin: "0 auto" }}>
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: ".75rem" }}>🔍</div>
              <h2 style={{ marginBottom: ".4rem" }}>Scan Reference Code</h2>
              <p style={{ color: "var(--c-muted)", fontSize: ".9rem", marginBottom: "1.5rem" }}>
                Enter the reference code from the collector's device, or scan the QR code
              </p>
              <form onSubmit={handleScan}>
                <input
                  type="text"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3D4"
                  style={{ textAlign: "center", fontSize: "1.2rem", letterSpacing: ".15em", fontWeight: "700", marginBottom: ".75rem" }}
                  autoFocus
                />
                {scanError && <p role="alert" style={{ marginBottom: ".75rem" }}>{scanError}</p>}
                <button type="submit" disabled={scanning || !refCode.trim()} style={{ width: "100%", padding: ".7rem", fontSize: "1rem", justifyContent: "center" }}>
                  {scanning ? "Looking up…" : "Look up Lot →"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
