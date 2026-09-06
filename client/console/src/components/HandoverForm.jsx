"use client";
import { useState } from "react";

// Extracted from verify/page.jsx (Plan 03 tasks 5-6, landed here in the
// 2026-09-06 repair-sms-and-evidence pass). No behaviour change: the
// condition buttons, the conditional downgrade-reason select, and the
// submit button are unchanged from the inline version.

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

// Props: { lot, onSubmit, submitting, error }.
// `error` is not in the plan's guide shape, but the original inline form
// rendered `handoverError` between the downgrade select and the submit
// button — dropping it would either lose that message or move it outside
// the form, both of which are behaviour changes. See task report.
export default function HandoverForm({ lot, onSubmit, submitting, error }) {
  const [inspectedCondition, setInspectedCondition]   = useState(lot?.condition ?? "");
  const [downgradeReasonCode, setDowngradeReasonCode] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ inspectedCondition, downgradeReasonCode });
  }

  return (
    <form onSubmit={handleSubmit}>
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

      {error && <p role="alert" style={{ marginBottom: ".75rem" }}>{error}</p>}

      <button
        type="submit"
        disabled={!inspectedCondition || submitting}
        style={{ width: "100%", padding: ".7rem", fontSize: "1rem", justifyContent: "center", marginTop: ".25rem" }}
      >
        {submitting ? "Submitting…" : "Send to Collector →"}
      </button>
    </form>
  );
}
