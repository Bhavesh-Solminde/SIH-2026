"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../../components/Nav.jsx";
import Icon from "../../../../components/Icon.jsx";
import { useAdminSession } from "../../../../lib/useSession.js";
import { api } from "../../../../lib/api.js";
import { t } from "../../../../lib/labels.js";
import { rupees, pct } from "../../../../lib/format.js";

// AI-ANOMALY-SPEC.md §7.1 — "rank recyclers by what they actually paid."
// No accusation, no detector output: this is the same numbers a recycler
// could compute about themselves, just laid next to each other.
export default function AdminRecyclersPage() {
  const admin = useAdminSession();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/admin/recyclers");
      setRows(data.recyclers ?? []);
    } catch (e) {
      setErr(e?.message ?? "failed to load");
    }
  }, []);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  if (!admin) return null;

  return (
    <>
      <Nav role="ADMIN" />
      <main>
        <h1>{t("admin_recyclers")}</h1>

        {err && <p role="alert">{err}</p>}

        {rows.length === 0 && !err && (
          <p className="empty-state"><Icon name="box" /> No recyclers yet.</p>
        )}

        {rows.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Recycler</th>
                  <th>District</th>
                  <th>{t("admin_published")}</th>
                  <th>{t("admin_median_paid")}</th>
                  <th>{t("admin_price_cut")}</th>
                  <th>{t("admin_downgrade_rate")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.recycler_id} data-downgraded={r.history === "insufficient" || undefined}>
                    <td>{r.name}</td>
                    <td>{r.district ?? "—"}</td>
                    {r.history === "insufficient" ? (
                      <td colSpan={4}>
                        <em>{t("admin_insufficient_history")} ({r.sample_size} handovers)</em>
                      </td>
                    ) : (
                      <>
                        <td>{rupees(r.published_rate)}/kg</td>
                        <td>{rupees(r.median_paid)}/kg</td>
                        <td>{r.price_cut_count != null ? `${r.price_cut_count} of ${r.price_cut_of}` : "—"}</td>
                        <td>{pct(r.downgrade_exception_rate)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="footer-note">{t("admin_footer_note")}</p>
      </main>
    </>
  );
}
