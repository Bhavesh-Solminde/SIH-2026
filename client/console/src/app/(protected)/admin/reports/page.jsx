"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../../components/Nav.jsx";
import CollectorReportRow from "../../../../components/CollectorReportRow.jsx";
import { useAdminSession } from "../../../../lib/useSession.js";
import { api } from "../../../../lib/api.js";
import { t } from "../../../../lib/labels.js";

// Collector-initiated "something is wrong" reports (POST /reports/:lot_id) —
// a human saying something is wrong, separate from the ML anomaly queue at
// /admin/queue. Same page shape (Nav, filter row, list) so an admin who
// already knows that page recognises this one immediately.
export default function AdminReportsPage() {
  const admin = useAdminSession();
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("open");
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await api.get(`/reports?status=${status}`);
      setReports(data.reports ?? []);
    } catch (e) {
      setErr(e?.message ?? "failed to load reports");
    }
  }, [status]);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  function handleResolved(id) {
    // Optimistic: OPEN view loses the row immediately; REVIEWED/all views
    // flip its status in place rather than refetching.
    if (status === "open") {
      setReports((rows) => rows.filter((r) => r.id !== id));
    } else {
      setReports((rows) => rows.map((r) => (r.id === id ? { ...r, status: "REVIEWED" } : r)));
    }
  }

  if (!admin) return null;

  return (
    <>
      <Nav role="ADMIN" />
      <main>
        <h1>{t("admin_reports")}</h1>

        <div className="filter-row">
          <label>
            Status{" "}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">{t("admin_report_status_open")}</option>
              <option value="reviewed">{t("admin_report_status_reviewed")}</option>
              <option value="all">{t("admin_report_status_all")}</option>
            </select>
          </label>
        </div>

        {err && <p role="alert">{err}</p>}

        {reports.length === 0 && !err && (
          <p className="empty-state">{t("admin_no_reports")}</p>
        )}

        {reports.length > 0 && (
          <ul>
            {reports.map((r) => (
              <CollectorReportRow key={r.id} report={r} onResolved={handleResolved} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
