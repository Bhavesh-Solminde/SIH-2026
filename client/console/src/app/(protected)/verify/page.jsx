"use client";
import { useState } from "react";
import Nav from "../../../components/Nav.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { t } from "../../../lib/labels.js";
import { rupees } from "../../../lib/format.js";

const CONDITIONS = ["GOOD", "FAIR", "POOR"];

const DOWNGRADE_REASONS = [
  { code: "DAMAGED", label: "Damaged in transit" },
  { code: "CONTAMINATED", label: "Contaminated" },
  { code: "MISREPRESENTED", label: "Condition misrepresented" },
  { code: "OTHER", label: "Other" },
];

export default function VerifyPage() {
  const recycler = useSession();

  // Phase 1 — Scan
  const [refCode, setRefCode] = useState("");
  const [lot, setLot] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [scanning, setScanning] = useState(false);

  // Phase 2 — Handover form
  const [inspectedCondition, setInspectedCondition] = useState("");
  const [downgradeReasonCode, setDowngradeReasonCode] = useState("");
  const [handoverError, setHandoverError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Phase 3 — Collector confirmation
  const [handover, setHandover] = useState(null);
  const [confirmError, setConfirmError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  async function handleScan(e) {
    e.preventDefault();
    if (!refCode.trim()) return;
    setScanError(null);
    setScanning(true);
    try {
      const result = await api.get(`/lots/${refCode.trim()}`);
      setLot(result.lot ?? result);
      setInspectedCondition((result.lot ?? result).condition ?? "");
    } catch (err) {
      setScanError(err.message ?? "Lot not found");
    } finally {
      setScanning(false);
    }
  }

  async function handleHandover(e) {
    e.preventDefault();
    setHandoverError(null);
    setSubmitting(true);
    try {
      const body = { lot_id: lot.id, inspected_condition: inspectedCondition };
      if (downgradeReasonCode && inspectedCondition !== lot.condition) {
        body.downgrade_reason_code = downgradeReasonCode;
      }
      const result = await api.post("/handover", body);
      setHandover(result.handover ?? result);
    } catch (err) {
      setHandoverError(err.message ?? "Handover failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    setConfirmError(null);
    setConfirming(true);
    try {
      const result = await api.post(`/handover/${lot.id}/confirm`);
      setConfirmed(result);
    } catch (err) {
      setConfirmError(err.message ?? "Confirmation failed");
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setRefCode("");
    setLot(null);
    setScanError(null);
    setHandover(null);
    setConfirmed(null);
    setInspectedCondition("");
    setDowngradeReasonCode("");
    setHandoverError(null);
    setConfirmError(null);
  }

  if (!recycler) return null;

  return (
    <>
      <Nav />
      <main>
        <h1>{t("verify")}</h1>

        {/* Phase 3 — confirmed */}
        {confirmed && (
          <section aria-label="confirmed">
            <p role="status">Handover confirmed.</p>
            <dl>
              <dt>Lot reference</dt>
              <dd>{lot.reference_code}</dd>
              <dt>{t("final_price")}</dt>
              <dd>{rupees(confirmed.final_price ?? confirmed.handover?.final_price)}</dd>
            </dl>
            <button type="button" onClick={reset}>
              Scan another lot
            </button>
          </section>
        )}

        {/* Phase 3 — awaiting collector confirmation */}
        {!confirmed && handover && (
          <section aria-label="collector-confirm">
            <p>{t("awaiting_collector")}</p>
            {confirmError && <p role="alert">{confirmError}</p>}
            <button type="button" onClick={handleConfirm} disabled={confirming}>
              {confirming ? "Confirming…" : "Confirm"}
            </button>
          </section>
        )}

        {/* Phase 2 — handover form */}
        {!handover && lot && (
          <section aria-label="handover-form">
            <h2>Lot details</h2>
            <dl>
              <dt>Category</dt>
              <dd>{lot.category ?? lot.category_code ?? lot.categoryCode}</dd>
              <dt>Quantity</dt>
              <dd>
                {lot.quantity} {lot.unit}
              </dd>
              <dt>Collector condition</dt>
              <dd>{lot.condition}</dd>
              <dt>{t("estimated")}</dt>
              <dd>{rupees(lot.estimated_value ?? lot.estimatedValue)}</dd>
            </dl>

            {lot.photos && lot.photos.length > 0 && (
              <div>
                {lot.photos.map((url, i) => (
                  <img key={i} src={url} alt={`Lot photo ${i + 1}`} style={{ maxWidth: 200 }} />
                ))}
              </div>
            )}

            <form onSubmit={handleHandover}>
              <fieldset>
                <legend>{t("inspected_condition")}</legend>
                {CONDITIONS.map((c) => (
                  <label key={c}>
                    <input
                      type="radio"
                      name="inspected_condition"
                      value={c}
                      checked={inspectedCondition === c}
                      onChange={() => setInspectedCondition(c)}
                      required
                    />
                    {c}
                  </label>
                ))}
              </fieldset>

              {inspectedCondition && inspectedCondition !== lot.condition && (
                <label>
                  {t("downgrade_reason")}
                  <select
                    value={downgradeReasonCode}
                    onChange={(e) => setDowngradeReasonCode(e.target.value)}
                  >
                    <option value="">— select —</option>
                    {DOWNGRADE_REASONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {handoverError && <p role="alert">{handoverError}</p>}

              <button type="submit" disabled={!inspectedCondition || submitting}>
                {submitting ? "Submitting…" : t("submit_handover")}
              </button>
            </form>
          </section>
        )}

        {/* Phase 1 — scan */}
        {!lot && (
          <section aria-label="scan">
            <form onSubmit={handleScan}>
              <label>
                Reference code
                <input
                  type="text"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value)}
                  placeholder="Enter or scan QR code"
                  autoFocus
                />
              </label>
              {scanError && <p role="alert">{scanError}</p>}
              <button type="submit" disabled={scanning}>
                {scanning ? "Looking up…" : "Look up lot"}
              </button>
            </form>
          </section>
        )}
      </main>
    </>
  );
}
