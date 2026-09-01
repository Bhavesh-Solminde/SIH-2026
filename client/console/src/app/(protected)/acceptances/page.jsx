"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import AcceptanceList from "../../../components/AcceptanceList.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";

export default function AcceptancesPage() {
  const recycler = useSession();
  const [data, setData] = useState({ acceptances: [], inactionMeans: null });

  const load = useCallback(async () => setData(await api.get("/recycler/acceptances")), []);

  useEffect(() => {
    if (recycler) {
      load();
      const timer = setInterval(load, 10_000);
      return () => clearInterval(timer);
    }
  }, [recycler, load]);

  async function respond(id, response) {
    await api.post(`/recycler/acceptances/${id}/respond`, { response });
    load();
  }

  if (!recycler) return null;
  return (
    <>
      <Nav />
      <main>
        <h1>Incoming</h1>
        <AcceptanceList rows={data.acceptances} inactionMeans={data.inactionMeans} onRespond={respond} />
      </main>
    </>
  );
}
