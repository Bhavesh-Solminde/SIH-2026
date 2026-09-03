"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Nav from "../../../components/Nav.jsx";
import AcceptanceList from "../../../components/AcceptanceList.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { rupees, shortDate } from "../../../lib/format.js";
import { t } from "../../../lib/labels.js";

export default function AcceptancesPage() {
  const recycler = useSession();
  const router = useRouter();
  const [data, setData] = useState({ acceptances: [], readyToInspect: [], inactionMeans: null });

  const load = useCallback(async () => setData(await api.get("/recycler/acceptances")), []);

  useEffect(() => {
    if (recycler) {
      load();
      const timer = setInterval(load, 10_000);
      return () => clearInterval(timer);
    }
  }, [recycler, load]);

  async function respond(id, action) {
    await api.post(`/recycler/acceptances/${id}/respond`, { action });
    load();
  }

  if (!recycler) return null;
  return (
    <>
      <Nav />
      <main>
        <h1>Incoming</h1>
        <AcceptanceList rows={data.acceptances} inactionMeans={data.inactionMeans} onRespond={respond} />

        {data.readyToInspect?.length > 0 && (
          <section aria-label="ready-to-inspect">
            <h2>Ready to Inspect</h2>
            <p>Collector has been notified. Go to Verify to complete physical inspection.</p>
            <ul>
              {data.readyToInspect.map((r) => (
                <li key={r.id}>
                  <strong>{r.categoryCode}</strong> · {r.quantity} {r.unit} ·{" "}
                  {rupees(r.acceptedRate)}/{r.acceptedUnit} · {shortDate(r.acceptedTs)}
                  <span> · ref: <code>{r.referenceCode}</code></span>
                  {" "}
                  <button
                    type="button"
                    onClick={() => router.push(`/verify?ref=${r.referenceCode}`)}
                  >
                    {t("verify")} →
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
