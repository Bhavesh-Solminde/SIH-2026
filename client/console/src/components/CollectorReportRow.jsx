"use client";
import { useState } from "react";
import Icon from "./Icon.jsx";
import { t } from "../lib/labels.js";
import { api } from "../lib/api.js";
import { shortDate, rupees } from "../lib/format.js";

// A collector-initiated "something is wrong" report (POST /reports/:lot_id,
// client/app/src/screens/LedgerScreen.jsx) — deliberately separate from the
// anomaly queue's ML-derived flags (AdminFlagRow.jsx). This is a human
// saying something is wrong, not a model's verdict, so it carries no
// severity or outcome vocabulary — the only action here is acknowledging it
// was read.
export default function CollectorReportRow({ report, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const reviewed = report.status === "REVIEWED";

  async function markReviewed() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/reports/${report.id}/resolve`, {});
      onResolved?.(report.id);
    } catch (e) {
      setErr(e?.message ?? "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="queue-row" data-downgraded={reviewed || undefined}>
      <div className="queue-row-head">
        <span
          aria-label="collector report"
          style={{
            background: "#fee2e2", color: "#991b1b",
            padding: "2px 8px", borderRadius: 4, fontWeight: "bold",
            fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <Icon name="warning" size={12} /> REPORT
        </span>
        <span className="sentence">{report.reason}</span>
        {report.final_total != null && (
          <span className="queue-row-stake">{rupees(report.final_total)}</span>
        )}
      </div>

      <div className="queue-row-meta">
        {report.recycler?.name ?? "—"}
        {report.category_code && <> · {report.category_code}</>}
        {report.quantity != null && <> · {report.quantity}{report.unit === "KG" ? "kg" : ""}</>}
        {report.reference_code && <> · ref {report.reference_code}</>}
        {report.handover_status && <> · handover {report.handover_status}</>}
        {" · "}{shortDate(report.created_at)}
      </div>

      {err && <p role="alert" style={{ fontSize: ".75rem" }}>{err}</p>}

      {!reviewed ? (
        <button type="button" className="secondary" onClick={markReviewed} disabled={busy}>
          <Icon name="check" size={12} /> {busy ? "…" : t("admin_report_mark_reviewed")}
        </button>
      ) : (
        <span className="queue-row-meta">
          <Icon name="check-circle" size={12} color="var(--c-primary)" /> {t("admin_report_reviewed")}
        </span>
      )}
    </li>
  );
}
