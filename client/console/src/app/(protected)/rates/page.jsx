"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import RateTable from "../../../components/RateTable.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { clog } from "../../../lib/logger.js";

export default function RatesPage() {
  const recycler = useSession();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      clog.rates.info("loading rates");
      const { rates } = await api.get("/recycler/rates");
      clog.rates.info("rates loaded", { count: rates?.length });
      setRows(rates ?? []);
      setErr(null);
    } catch (e) {
      clog.rates.error("load failed", e);
      setErr("Failed to load rates: " + e.message);
    }
  }, []);

  useEffect(() => {
    if (recycler) load();
  }, [recycler, load]);

  async function publish(rates) {
    try {
      clog.rates.info("publishing rates", { count: rates.length });
      // API expects a plain array, not { rates: [...] }
      await api.post("/recycler/rates", rates);
      clog.rates.info("rates published");
      setMsg(`Published ${rates.length} rate${rates.length === 1 ? "" : "s"}.`);
      load();
    } catch (e) {
      clog.rates.error("publish failed", e);
      setErr("Publish failed: " + e.message);
    }
  }

  if (!recycler) return null;
  return (
    <>
      <Nav />
      <main>
        <h1>{recycler.name} — Rates</h1>
        {msg && <p role="status" style={{ color: "green" }}>{msg}</p>}
        {err && <p role="alert" style={{ color: "red" }}>{err}</p>}
        <RateTable rows={rows} onPublish={publish} />
      </main>
    </>
  );
}
