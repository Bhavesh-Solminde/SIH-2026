"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon.jsx";
import { rupees } from "../lib/format.js";

// Extracted from verify/page.jsx (Plan 03 tasks 5-6, landed here in the
// 2026-09-06 repair-sms-and-evidence pass).
//
// Colors moved to the shared .tone-* classes in globals.css (same triad
// FlagCard's severity badges use) instead of a second inline-hex copy;
// emoji swapped for the shared Icon component.
const CONDITIONS = [
  { code: "GOOD", label: "Good", icon: "check-circle", tone: "tone-ok" },
  { code: "FAIR", label: "Fair", icon: "warning",       tone: "tone-caution" },
  { code: "POOR", label: "Poor", icon: "warning",       tone: "tone-bad" },
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

// Mirrors CONDITION_FACTOR in server/api/src/routes/handover.js — the price
// the server would derive if this form sent no explicit one. Kept here only
// to seed and label the suggestion buttons; the server still owns the
// default when final_unit_price is omitted.
const CONDITION_FACTOR = { GOOD: 1.0, FAIR: 0.85, POOR: 0.7 };

// Number("") is 0, so a plain Number() coercion turns an empty price box
// into a valid ₹0 and lets it be submitted. Blank is "no value", not zero.
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Props: { lot, onSubmit, submitting, error }.
// `error` is not in the plan's guide shape, but the original inline form
// rendered `handoverError` between the downgrade select and the submit
// button — dropping it would either lose that message or move it outside
// the form, both of which are behaviour changes. See task report.
export default function HandoverForm({ lot, onSubmit, submitting, error }) {
  const [inspectedCondition, setInspectedCondition]   = useState(lot?.condition ?? "");
  const [downgradeReasonCode, setDowngradeReasonCode] = useState("");
  const [finalUnitPrice, setFinalUnitPrice]           = useState("");
  // Once the recycler types a price of their own, changing the condition
  // must not silently overwrite it — the grade and the settled price are
  // two separate facts, and the one a human typed is the one that wins.
  const [priceTouched, setPriceTouched]               = useState(false);

  const quantity     = num(lot?.quantity) ?? 0;
  const unit         = lot?.accepted_unit ?? lot?.unit ?? "KG";
  const acceptedRate = num(lot?.accepted_rate);
  const estimated    = num(lot?.estimated_value ?? lot?.estimatedValue);
  // What the collector was quoted per unit. Falls back to deriving it from
  // their estimate when only the total came through.
  const estimatedRate = estimated != null && quantity > 0
    ? +(estimated / quantity).toFixed(2)
    : null;

  const gradedRate = acceptedRate != null && inspectedCondition
    ? +(acceptedRate * (CONDITION_FACTOR[inspectedCondition] ?? 1)).toFixed(2)
    : null;

  // Seed the field with the graded price so the common case is one click,
  // and keep it in step with the condition until the recycler edits it.
  useEffect(() => {
    if (priceTouched) return;
    if (gradedRate != null) setFinalUnitPrice(String(gradedRate));
  }, [gradedRate, priceTouched]);

  const parsedPrice = num(finalUnitPrice);
  const priceValid  = parsedPrice != null && parsedPrice >= 0;
  const finalTotal  = priceValid ? +(parsedPrice * quantity).toFixed(2) : null;
  const priceLine   = priceValid ? `${quantity} ${unit} × ${rupees(parsedPrice)}` : null;

  const suggestions = useMemo(() => [
    {
      key: "graded",
      label: "Grade-adjusted",
      hint: inspectedCondition ? `${inspectedCondition} × accepted rate` : "select a condition first",
      value: gradedRate,
    },
    {
      key: "accepted",
      label: "Collector's accepted rate",
      hint: "the rate the collector agreed to",
      value: acceptedRate,
    },
    {
      key: "estimated",
      label: "Collector's estimate",
      hint: estimated != null ? `${rupees(estimated)} over ${quantity} ${unit}` : "no estimate on this lot",
      value: estimatedRate,
    },
  ], [gradedRate, acceptedRate, estimatedRate, estimated, quantity, unit, inspectedCondition]);

  function applySuggestion(value) {
    setPriceTouched(true);
    setFinalUnitPrice(String(value));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({
      inspectedCondition,
      downgradeReasonCode,
      finalUnitPrice: priceValid ? parsedPrice : undefined,
    });
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
              className={`cond-btn${selected ? ` selected ${c.tone}` : ""}`}
            >
              <Icon name={c.icon} size={22} />
              {c.label}
            </button>
          );
        })}
      </div>

      {inspectedCondition && inspectedCondition !== lot.condition && (
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: ".85rem", fontWeight: "500", marginBottom: ".35rem", color: "var(--c-warn)" }}>
            <Icon name="warning" size={14} /> Downgrade reason required
          </label>
          <select value={downgradeReasonCode} onChange={(e) => setDowngradeReasonCode(e.target.value)} required>
            <option value="">— select reason —</option>
            {DOWNGRADE_REASONS.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Final price ────────────────────────────────────────────────────
          The recycler had no way to state a price at all: it was derived
          from a three-step condition ladder and sent silently. A yard that
          has weighed and sorted the material lands between those steps
          constantly, and the number the collector counter-signs has to be
          the one the two of them actually agreed on. */}
      <fieldset className="final-price">
        <legend>Final price after inspection</legend>

        <div className="final-price-row">
          <label htmlFor="final-unit-price">Price per {unit}</label>
          <div className="final-price-input">
            <span aria-hidden="true">₹</span>
            <input
              id="final-unit-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={finalUnitPrice}
              onChange={(e) => { setPriceTouched(true); setFinalUnitPrice(e.target.value); }}
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <div className="final-price-suggestions">
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              className="secondary suggestion-btn"
              onClick={() => applySuggestion(s.value)}
              disabled={s.value == null}
              title={s.hint}
            >
              <span className="suggestion-label">{s.label}</span>
              <span className="suggestion-value">
                {s.value != null ? `${rupees(s.value)} / ${unit}` : "—"}
              </span>
            </button>
          ))}
        </div>

        <p className="final-price-total">
          Collector will be asked to confirm{" "}
          <strong>{finalTotal != null ? rupees(finalTotal) : "—"}</strong>
          {priceLine && <> &nbsp;({priceLine})</>}
        </p>
      </fieldset>

      {error && <p role="alert" style={{ marginBottom: ".75rem" }}>{error}</p>}

      <button
        type="submit"
        disabled={!inspectedCondition || !priceValid || submitting}
        style={{ width: "100%", padding: ".7rem", fontSize: "1rem", justifyContent: "center", marginTop: ".25rem" }}
      >
        {submitting ? "Submitting…" : "Send to Collector →"}
      </button>
    </form>
  );
}
