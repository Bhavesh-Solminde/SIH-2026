"use client";
import { rupees, shortDate } from "../lib/format.js";
import { t } from "../lib/labels.js";

export default function AcceptanceList({ rows = [], inactionMeans, onRespond }) {
  return (
    <div>
      {inactionMeans === "collector_arrives_as_planned" && <p role="note">{t("inaction_note")}</p>}
      {rows.length === 0 && <p>No incoming acceptances.</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <strong>{r.categoryCode}</strong> · {r.quantity} {r.unit} · {t("estimated")} {rupees(r.estimatedValue)} ·{" "}
            {rupees(r.acceptedRate)}/{r.acceptedUnit} · {shortDate(r.acceptedTs)}
            <span> · collector {r.collectorId}</span>
            {r.recyclerResponse === "NONE" ? (
              <span>
                {" "}
                <button type="button" onClick={() => onRespond(r.id, "ACCEPT")}>
                  {t("acknowledge")}
                </button>
                <button type="button" onClick={() => onRespond(r.id, "REJECT")}>
                  {t("decline")}
                </button>
              </span>
            ) : (
              <em> {r.recyclerResponse}</em>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
