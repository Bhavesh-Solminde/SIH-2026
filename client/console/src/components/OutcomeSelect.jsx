"use client";
import { useState } from "react";
import { t } from "../lib/labels.js";
import { api } from "../lib/api.js";

// AI-ANOMALY-SPEC.md §3.4 — the admin_outcome vocabulary. Every outcome here
// is terminal in this build (it resolves the flag; there is no re-open flow).
const OUTCOMES = [
  ["JUSTIFIED", "admin_outcome_justified"],
  ["SUSPICIOUS", "admin_outcome_suspicious"],
  ["DISPUTED", "admin_outcome_disputed"],
  ["UNRESOLVED", "admin_outcome_unresolved"],
  ["INVALID", "admin_outcome_invalid"],
];

export default function OutcomeSelect({ flagId, onRecorded }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function record() {
    if (!value) return;
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/admin/flags/${flagId}`, { admin_outcome: value });
      onRecorded?.(value);
    } catch (e) {
      setErr(e?.message ?? "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: ".4rem", alignItems: "center" }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} aria-label={t("admin_outcome_prompt")}>
        <option value="">{t("admin_outcome_prompt")}</option>
        {OUTCOMES.map(([code, key]) => (
          <option key={code} value={code}>{t(key)}</option>
        ))}
      </select>
      <button type="button" className="secondary" onClick={record} disabled={busy || !value}>
        {busy ? "…" : "Save"}
      </button>
      {err && <span role="alert" style={{ fontSize: ".75rem" }}>{err}</span>}
    </span>
  );
}
