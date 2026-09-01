"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import RateTable from "../../../components/RateTable.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";

export default function RatesPage() {
  const recycler = useSession();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { rates } = await api.get("/recycler/rates");
    setRows(rates);
  }, []);

  useEffect(() => {
    if (recycler) load();
  }, [recycler, load]);

  async function publish(rates) {
    await api.post("/recycler/rates", { rates });
    setMsg(`Published ${rates.length} rate${rates.length === 1 ? "" : "s"}.`);
    load();
  }

  if (!recycler) return null;
  return (
    <>
      <Nav />
      <main>
        <h1>{recycler.name} — Rates</h1>
        {msg && <p role="status">{msg}</p>}
        <RateTable rows={rows} onPublish={publish} />
      </main>
    </>
  );
}
