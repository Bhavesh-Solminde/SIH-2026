"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import FlagCard from "../../../components/FlagCard.jsx";
import Icon from "../../../components/Icon.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";

export default function FlagsPage() {
  const recycler = useSession();
  const [flags, setFlags] = useState([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  const load = useCallback(async () => {
    const data = await api.get("/recycler/flags");
    setFlags(data.flags ?? data);
  }, []);

  useEffect(() => {
    if (recycler) load();
  }, [recycler, load]);

  // The automatic path is scoreHandover firing on every POST /handover — it
  // recomputes this recycler's own flag rate the moment a new transaction is
  // scored. This button is the demo path: force a recheck on stage and show
  // what came back, so an empty list is never ambiguous between "nothing
  // wrong" and "nothing ran".
  async function handleRun() {
    setRunning(true);
    try {
      const result = await api.post("/recycler/anomaly/recheck", {});
      setLastRun(result);
      await load();
    } catch (err) {
      setLastRun({ status: "error", reason: err?.message ?? "request failed" });
    } finally {
      setRunning(false);
    }
  }

  if (!recycler) return null;

  return (
    <>
      <Nav />
      <main>
        <h1>Flags</h1>

        <button type="button" onClick={handleRun} disabled={running}>
          {running ? "Rechecking…" : "Recheck my flag rate"}
        </button>

        {lastRun?.status === "flagged" && (
          <p role="alert">
            {lastRun.flagged} of your last {lastRun.total} scored transactions were flagged by the
            price model ({Math.round(lastRun.rate * 100)}%, over the {Math.round(lastRun.threshold * 100)}% line).
          </p>
        )}

        {lastRun?.status === "clear" && (
          <p>
            {lastRun.flagged} of your last {lastRun.total} scored transactions were flagged by the
            price model — under the line.
          </p>
        )}

        {lastRun?.status === "insufficient_history" && (
          <p>
            Not enough scored transactions yet ({lastRun.total} of {lastRun.minSample} needed) to
            compute a flag rate.
          </p>
        )}

        {lastRun?.status === "error" && (
          <p role="alert">Recheck failed — {lastRun.reason}</p>
        )}

        {flags.length === 0 && (
          <p className="empty-state"><Icon name="check-circle" color="var(--c-primary)" /> No flags — all clear</p>
        )}

        {flags.length > 0 && (
          <ul>
            {flags.map((f) => (
              <FlagCard key={f.id} flag={f} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
