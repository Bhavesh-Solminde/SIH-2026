"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import RateTable from "../../../components/RateTable.jsx";
import AuthorisationPanel from "../../../components/AuthorisationPanel.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { clog } from "../../../lib/logger.js";

export default function RatesPage() {
  const recycler = useSession();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [authorisation, setAuthorisation] = useState(null);

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

  useEffect(() => {
    // Best-effort and deliberately silent on failure: the authorisation
    // panel is supporting evidence, not the page's job. A failed fetch here
    // must never block the rates table or surface an error banner over it —
    // it just means the panel stays hidden this load.
    let cancelled = false;
    api
      .get("/public/authorisation")
      .then((body) => { if (!cancelled) setAuthorisation(body); })
      .catch((e) => clog.rates.warn("authorisation fetch failed", e));
    return () => { cancelled = true; };
  }, []);

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
        <AuthorisationPanel authorisation={authorisation} />
        {msg && <p role="status">{msg}</p>}
        {err && <p role="alert">{err}</p>}
        <RateTable rows={rows} onPublish={publish} />
      </main>
    </>
  );
}
