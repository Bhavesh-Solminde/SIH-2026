"use client";

// Header strip for the admin queue: open flags by severity, scoring
// coverage, and how many parties currently sit over the flag-rate line.
// Plain numbers, no chart — this is a status check before the ranked list,
// not a dashboard in its own right.
export default function SummaryStrip({ summary }) {
  if (!summary) return null;
  const sev = summary.open_flags_by_severity ?? {};
  return (
    <dl className="summary-strip">
      <div className="summary-stat">
        <dt>Critical</dt>
        <dd style={{ color: "#991b1b" }}>{sev.CRITICAL ?? 0}</dd>
      </div>
      <div className="summary-stat">
        <dt>Warn</dt>
        <dd style={{ color: "#92400e" }}>{sev.WARN ?? 0}</dd>
      </div>
      <div className="summary-stat">
        <dt>Info</dt>
        <dd style={{ color: "#1e40af" }}>{sev.INFO ?? 0}</dd>
      </div>
      <div className="summary-stat">
        <dt>Scored</dt>
        <dd>{summary.handovers_scored}/{summary.handovers_total}</dd>
      </div>
      <div className="summary-stat">
        <dt>Parties over line</dt>
        <dd>{summary.parties_over_flag_rate_line}</dd>
      </div>
    </dl>
  );
}
