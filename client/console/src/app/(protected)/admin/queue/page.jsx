"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../../components/Nav.jsx";
import Icon from "../../../../components/Icon.jsx";
import SummaryStrip from "../../../../components/SummaryStrip.jsx";
import AdminFlagRow from "../../../../components/AdminFlagRow.jsx";
import { useAdminSession } from "../../../../lib/useSession.js";
import { api } from "../../../../lib/api.js";
import { t } from "../../../../lib/labels.js";

// AI-ANOMALY-SPEC.md §3.3 — the ranked admin queue. Top 20 by default,
// worst first. Filters are additive narrowing, not a replacement for the
// server's own ranking (priority = severity_weight × value_at_stake ×
// party_flag_rate) — this page never re-sorts what the API returns.
export default function AdminQueuePage() {
  const admin = useAdminSession();
  const [summary, setSummary] = useState(null);
  const [flags, setFlags] = useState([]);
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("open");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams({ status });
      if (severity) params.set("severity", severity);
      const [summaryData, flagsData] = await Promise.all([
        api.get("/admin/summary"),
        api.get(`/admin/flags?${params.toString()}`),
      ]);
      setSummary(summaryData);
      setFlags(flagsData.flags ?? []);
    } catch (e) {
      setErr(e?.message ?? "failed to load queue");
    }
  }, [severity, status]);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  async function runDetection() {
    setRunning(true);
    try {
      await api.post("/admin/rescore", {});
      await load();
    } catch (e) {
      setErr(e?.message ?? "rescore failed");
    } finally {
      setRunning(false);
    }
  }

  if (!admin) return null;

  return (
    <>
      <Nav role="ADMIN" />
      <main>
        <h1>{t("admin_queue")}</h1>

        <SummaryStrip summary={summary} />

        <div className="filter-row">
          <label>
            Severity{" "}
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">All</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARN">Warn</option>
              <option value="INFO">Info</option>
            </select>
          </label>
          <label>
            Status{" "}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
          </label>
          <button type="button" className="secondary" onClick={runDetection} disabled={running}>
            <Icon name="refresh" size={14} /> {running ? "Running…" : t("admin_run_detection")}
          </button>
        </div>

        {err && <p role="alert">{err}</p>}

        {flags.length === 0 && !err && (
          <p className="empty-state"><Icon name="check-circle" color="var(--c-primary)" /> {t("admin_no_flags")}</p>
        )}

        {flags.length > 0 && (
          <ul>
            {flags.map((f) => (
              <AdminFlagRow key={f.id} flag={f} onResolved={() => load()} />
            ))}
          </ul>
        )}

        <p className="footer-note">{t("admin_footer_note")}</p>
      </main>
    </>
  );
}
