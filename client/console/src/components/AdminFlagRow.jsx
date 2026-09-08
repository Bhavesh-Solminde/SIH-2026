"use client";
import { useState } from "react";
import Icon from "./Icon.jsx";
import OutcomeSelect from "./OutcomeSelect.jsx";
import { shortDate } from "../lib/format.js";

// Severity styling matches FlagCard.jsx exactly (same hex, same icon
// mapping) so a flag reads the same way on the recycler's own /flags page
// and here — severity is never colour-alone, per FlagCard's precedent.
const SEVERITY_STYLES = {
  INFO: { background: "#dbeafe", color: "#1e40af" },
  WARN: { background: "#fef3c7", color: "#92400e" },
  CRITICAL: { background: "#fee2e2", color: "#991b1b" },
};
const SEVERITY_ICON = { INFO: "check-circle", WARN: "warning", CRITICAL: "warning" };

export default function AdminFlagRow({ flag, onResolved }) {
  const [expanded, setExpanded] = useState(false);
  const [resolved, setResolved] = useState(false);
  const style = SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES.INFO;

  return (
    <li className="queue-row" data-downgraded={resolved || undefined}>
      <div className="queue-row-head">
        <span
          aria-label={`severity ${flag.severity}`}
          style={{
            ...style, padding: "2px 8px", borderRadius: 4, fontWeight: "bold",
            fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <Icon name={SEVERITY_ICON[flag.severity] ?? "check-circle"} size={12} />
          {flag.severity}
        </span>
        <span className="sentence">{flag.sentence}</span>
        <span className="queue-row-stake">₹{flag.value_at_stake}</span>
      </div>

      <div className="queue-row-meta">
        {flag.recycler_name ?? flag.subject_type} · rate {Math.round(flag.party_flag_rate * 100)}%
        {flag.history === "insufficient" && <> · <em>not enough history yet</em></>}
        {" · priority "}{flag.priority}
        {" · "}{shortDate(flag.created_at)}
        {" · "}
        <button type="button" className="secondary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "hide numbers" : "show numbers"}
        </button>
      </div>

      {expanded && (
        <pre className="queue-row-detail">{JSON.stringify(flag.detail, null, 2)}</pre>
      )}

      {!resolved && !flag.resolved_at ? (
        <OutcomeSelect flagId={flag.id} onRecorded={() => { setResolved(true); onResolved?.(flag.id); }} />
      ) : (
        <span className="queue-row-meta">outcome: {flag.admin_outcome ?? "recorded"}</span>
      )}
    </li>
  );
}
