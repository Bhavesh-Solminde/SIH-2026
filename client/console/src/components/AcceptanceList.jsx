"use client";
import { rupees, shortDate } from "../lib/format.js";
import { t } from "../lib/labels.js";
import Icon from "./Icon.jsx";

// Every field on a row used to run together as one line of prose with the
// Acknowledge and Decline buttons jammed against the end of it — category,
// weight, estimate, rate, date and collector id separated only by middots,
// with nothing to tell the recycler which number was which. It read as a
// sentence and had to be parsed as one.
//
// The row is now a card: the material and weight lead, the money sits in a
// labelled group beneath, and the two actions are pushed to the right where
// they are always in the same place regardless of how long the values are.
export default function AcceptanceList({ rows = [], inactionMeans, onRespond }) {
  return (
    <div>
      {inactionMeans === "collector_arrives_as_planned" && <p role="note">{t("inaction_note")}</p>}
      {rows.length === 0 && (
        <p className="empty-state"><Icon name="hourglass" /> No incoming acceptances.</p>
      )}
      <ul className="acceptance-list">
        {rows.map((r) => (
          <li key={r.id} className="acceptance-row">
            <div className="acceptance-main">
              <div className="acceptance-head">
                <strong className="acceptance-category">{r.categoryCode}</strong>
                <span className="acceptance-qty">{r.quantity} {r.unit}</span>
                <span className="acceptance-date">{shortDate(r.acceptedTs)}</span>
              </div>

              <dl className="acceptance-facts">
                <div>
                  <dt>{t("estimated")}</dt>
                  <dd>{rupees(r.estimatedValue)}</dd>
                </div>
                <div>
                  <dt>Rate</dt>
                  <dd>{rupees(r.acceptedRate)} / {r.acceptedUnit}</dd>
                </div>
                <div>
                  <dt>Collector</dt>
                  <dd><code>{r.collectorId}</code></dd>
                </div>
              </dl>
            </div>

            <div className="acceptance-actions">
              {r.recyclerResponse === "NONE" ? (
                <>
                  <button type="button" onClick={() => onRespond(r.id, "ACCEPT")}>
                    {t("acknowledge")}
                  </button>
                  <button type="button" className="secondary" onClick={() => onRespond(r.id, "REJECT")}>
                    {t("decline")}
                  </button>
                </>
              ) : (
                <span className={`badge ${r.recyclerResponse === "ACKNOWLEDGED" ? "badge-ok" : "badge-danger"}`}>
                  {r.recyclerResponse}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
