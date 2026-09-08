"use client";
import { shortDate } from "../lib/format.js";
import Icon from "./Icon.jsx";

// Extracted from flags/page.jsx (Plan 03 tasks 5-6, landed here in the
// 2026-09-06 repair-sms-and-evidence pass). No behaviour change: the
// severity badge and the plain-language line are unchanged from the inline
// version — only the surrounding <li> per flag is now this component.
//
// Fixed 2026-09-07: this used to read flag.description/.subject/.raised_at,
// a shape GET /recycler/flags never actually returns (it returns detail,
// subject_type/subject_id, created_at — see routes/recycler.js) — every one
// of those three rendered blank. test/flags.test.jsx mocked the old shape
// too, so the suite stayed green while the real page rendered nothing. Both
// are now pointed at the real contract: the server computes the
// plain-language line itself (lib/flagSentence.js) and sends it as
// `sentence`, so this component and the admin queue always agree on the
// wording for the same detector.

// Colors unchanged from the original inline SEVERITY_STYLES (test/flags.test.jsx
// pins these exact values) — only the icon is new, to make WARN vs CRITICAL
// scannable at a glance rather than by color alone.
const SEVERITY_STYLES = {
  INFO: { background: "#dbeafe", color: "#1e40af" },     // blue
  WARN: { background: "#fef3c7", color: "#92400e" },     // amber
  CRITICAL: { background: "#fee2e2", color: "#991b1b" }, // red
};
const SEVERITY_ICON = { INFO: "check-circle", WARN: "warning", CRITICAL: "warning" };

export default function FlagCard({ flag }) {
  const style = SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES.INFO;
  return (
    <li>
      <span
        aria-label={`severity ${flag.severity}`}
        style={{
          ...style,
          padding: "2px 8px",
          borderRadius: 4,
          fontWeight: "bold",
          fontSize: "0.75rem",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Icon name={SEVERITY_ICON[flag.severity] ?? "check-circle"} size={12} />
        {flag.severity}
      </span>{" "}
      <strong>{flag.detector_code}</strong>{" "}
      <span>{flag.sentence}</span>{" "}
      <span>· {flag.subject_type} {flag.subject_id?.slice(0, 8)}</span>{" "}
      <span>· {shortDate(flag.created_at)}</span>
    </li>
  );
}
