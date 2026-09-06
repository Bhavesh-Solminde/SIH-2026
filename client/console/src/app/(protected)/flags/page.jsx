"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import FlagCard from "../../../components/FlagCard.jsx";
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

  // The async trigger on handover-confirm covers the natural path. This covers
  // the demo path: force a run on stage and show what came back, so an empty
  // list is never ambiguous between "nothing wrong" and "nothing ran".
  async function handleRun() {
    setRunning(true);
    try {
      const result = await api.post("/detect-run", {});
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
          {running ? "Running detection…" : "Run detection"}
        </button>

        {lastRun?.status === "ok" && (
          <p>
            {lastRun.flagsWritten} flags written from {lastRun.detectorsRun?.length ?? 0} detectors.
            {lastRun.detectorsSkipped?.length > 0 && (
              <>
                {" "}Skipped:{" "}
                {/* Skip.to_dict() serialises as { code, reason } — see
                    server/aiml/bhaav_aiml/models.py. */}
                {lastRun.detectorsSkipped
                  .map((s) => `${s.code} (${s.reason})`)
                  .join(", ")}
              </>
            )}
          </p>
        )}

        {lastRun?.status === "pending" && (
          <p role="alert">
            Detector service unavailable — no flags were written. {lastRun.reason}
          </p>
        )}

        {lastRun?.status === "error" && (
          <p role="alert">Detector service unavailable — {lastRun.reason}</p>
        )}

        {flags.length === 0 && (
          <p>No flags — all clear</p>
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
