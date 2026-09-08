"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../../components/Nav.jsx";
import { useAdminSession } from "../../../../lib/useSession.js";
import { api } from "../../../../lib/api.js";
import { t } from "../../../../lib/labels.js";

// Every MPCB-VALID recycler and the green "verified" badge they see on their
// own login (Nav.jsx → GET /auth/me → mpcbVerified). Revoking here sets
// recycler.trust_badge_revoked, independent of authorizationStatus — the
// column mpcb-refresh.js owns and this page never touches.
export default function AdminBadgesPage() {
  const admin = useAdminSession();
  const [recyclers, setRecyclers] = useState([]);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await api.get("/recyclers/verified");
      setRecyclers(data.recyclers ?? []);
    } catch (e) {
      setErr(e?.message ?? "failed to load recyclers");
    }
  }, []);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  async function toggle(recycler) {
    setBusyId(recycler.id);
    setErr(null);
    try {
      const nextRevoked = !recycler.badge_revoked;
      await api.patch(`/recyclers/${recycler.id}/badge`, { revoked: nextRevoked });
      setRecyclers((rows) => rows.map((r) => (r.id === recycler.id ? { ...r, badge_revoked: nextRevoked } : r)));
    } catch (e) {
      setErr(e?.message ?? "failed to update badge");
    } finally {
      setBusyId(null);
    }
  }

  if (!admin) return null;

  return (
    <>
      <Nav role="ADMIN" />
      <main>
        <h1>{t("admin_badges")}</h1>
        <p className="footer-note">{t("admin_badges_intro")}</p>

        {err && <p role="alert">{err}</p>}

        {recyclers.length === 0 && !err && (
          <p className="empty-state">{t("admin_no_verified_recyclers")}</p>
        )}

        {recyclers.length > 0 && (
          <ul>
            {recyclers.map((r) => (
              <li key={r.id} className="queue-row">
                <div className="queue-row-head">
                  <span
                    className={`badge ${r.badge_revoked ? "badge-danger" : "badge-ok"}`}
                  >
                    {r.badge_revoked ? t("admin_badge_revoked_label") : t("admin_badge_active_label")}
                  </span>
                  <span className="sentence">{r.name}</span>
                </div>
                <div className="queue-row-meta">
                  {r.district ?? "—"}
                  {" · "}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => toggle(r)}
                    disabled={busyId === r.id}
                  >
                    {busyId === r.id ? "…" : r.badge_revoked ? t("admin_badge_restore") : t("admin_badge_revoke")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
