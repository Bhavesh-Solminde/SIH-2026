"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { shortDate } from "../../../lib/format.js";

const SEVERITY_STYLES = {
  INFO: { background: "#dbeafe", color: "#1e40af" },     // blue
  WARN: { background: "#fef3c7", color: "#92400e" },     // amber
  CRITICAL: { background: "#fee2e2", color: "#991b1b" }, // red
};

export default function FlagsPage() {
  const recycler = useSession();
  const [flags, setFlags] = useState([]);

  const load = useCallback(async () => {
    const data = await api.get("/recycler/flags");
    setFlags(data.flags ?? data);
  }, []);

  useEffect(() => {
    if (recycler) load();
  }, [recycler, load]);

  if (!recycler) return null;

  return (
    <>
      <Nav />
      <main>
        <h1>Flags</h1>

        {flags.length === 0 && (
          <p>No flags — all clear</p>
        )}

        {flags.length > 0 && (
          <ul>
            {flags.map((f) => {
              const style = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.INFO;
              return (
                <li key={f.id}>
                  <span
                    aria-label={`severity ${f.severity}`}
                    style={{
                      ...style,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: "bold",
                      fontSize: "0.75rem",
                    }}
                  >
                    {f.severity}
                  </span>{" "}
                  <strong>{f.detector_code}</strong>{" "}
                  <span>{f.description}</span>{" "}
                  <span>· {f.subject}</span>{" "}
                  <span>· {shortDate(f.raised_at ?? f.date)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
