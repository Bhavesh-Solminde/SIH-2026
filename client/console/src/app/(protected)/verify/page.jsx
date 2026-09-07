"use client";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "../../../components/Nav.jsx";
import HandoverForm from "../../../components/HandoverForm.jsx";
import QrScanner from "../../../components/QrScanner.jsx";
import Icon from "../../../components/Icon.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { rupees } from "../../../lib/format.js";

const DT_STYLE = { fontSize: ".78rem", color: "var(--c-muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".2rem" };
const DD_STYLE = { fontWeight: "600", fontSize: ".95rem" };

// useSearchParams opts the subtree into client-side rendering, and Next 15
// fails the production build outright ("should be wrapped in a suspense
// boundary") when the prerenderer reaches it with nothing to fall back to.
// The page has read ?ref= since it was written, so `next build` has been
// failing on /verify; only `next dev` was ever exercised. The boundary makes
// the bail-out explicit and gives the prerender something to emit.
export default function VerifyPage() {
  return (
    <Suspense fallback={<><Nav /><main><h1>Verify &amp; Sign</h1></main></>}>
      <VerifyPageContent />
    </Suspense>
  );
}

function VerifyPageContent() {
  const recycler = useSession();
  const searchParams = useSearchParams();

  const [refCode, setRefCode]                     = useState(searchParams.get("ref") ?? "");
  const [lot, setLot]                             = useState(null);
  const [scanError, setScanError]                 = useState(null);
  const [scanning, setScanning]                   = useState(false);

  const [handoverError, setHandoverError]             = useState(null);
  const [submitting, setSubmitting]                   = useState(false);

  const [handover, setHandover]     = useState(null);
  const [confirmed, setConfirmed]   = useState(null);

  // A lookup answers two questions at once: which lot is this, and has it
  // already been inspected? Asking only the first is what produced the
  // "handover_already_exists" wall — reloading /verify?ref=… after a
  // successful submit re-offered the inspection form for a lot that was
  // already past it, and the only way to find out was to submit again.
  async function lookupRef(code) {
    if (!code?.trim()) return;
    setScanError(null);
    setScanning(true);
    try {
      const result = await api.get(`/lots/${code.trim()}`);
      const l = result.lot ?? result;
      setLot(l);
      await loadExistingHandover(l.id);
    } catch (err) {
      setScanError(err.body?.error === "not_found" ? "Lot not found — check the reference code." : (err.message ?? "Lot not found"));
    } finally {
      setScanning(false);
    }
  }

  // 404 here is the normal case — most scans are of lots nobody has
  // inspected yet — so a miss must leave the form showing, not raise.
  async function loadExistingHandover(lotId) {
    if (!lotId) return;
    try {
      const { handover: h } = await api.get(`/handover/by-lot/${lotId}`);
      if (!h) return;
      setHandover(h);
      if (h.collector_confirmed_at) {
        setConfirmed({ final_price: h.final_total, handover: h });
      }
    } catch {
      // No handover yet (404), or the lookup failed. Either way the
      // inspection form is the right thing to show.
    }
  }

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) lookupRef(ref);
  }, []);

  async function handleScan(e) {
    e.preventDefault();
    lookupRef(refCode);
  }

  // One lookup path for both entry points: a successful QR decode fills
  // the same reference field the typed form uses, then runs the same
  // lookupRef() call. Nothing about the request differs by entry point.
  function handleQrScan(decodedText) {
    const code = (decodedText ?? "").trim().toUpperCase();
    setRefCode(code);
    lookupRef(code);
  }

  async function handleHandover({ inspectedCondition, downgradeReasonCode, finalUnitPrice }) {
    setHandoverError(null);
    setSubmitting(true);
    try {
      const body = { lot_id: lot.id, inspected_condition: inspectedCondition };
      if (downgradeReasonCode && inspectedCondition !== lot.condition) body.downgrade_reason_code = downgradeReasonCode;
      if (finalUnitPrice !== undefined) body.final_unit_price = finalUnitPrice;
      const result = await api.post("/handover", body);
      setHandover(result.handover ?? result);
    } catch (err) {
      // Someone — another terminal, or this one before a reload — already
      // inspected this lot. That is a state to move into, not an error to
      // show: the server hands back the whole existing handover, so show it.
      if (err.body?.error === "handover_already_exists") {
        setHandover(err.body);
        if (err.body.collector_confirmed_at) {
          setConfirmed({ final_price: err.body.final_total, handover: err.body });
        }
        return;
      }
      setHandoverError(err.message ?? "Handover failed");
    } finally {
      setSubmitting(false);
    }
  }


  // While the collector has it, this page is a status board. Poll rather than
  // making the recycler reload — a reload is exactly the action that used to
  // dump them back onto the inspection form.
  useEffect(() => {
    if (!handover || confirmed || !lot?.id) return;
    if (handover.status === "DISPUTED") return;
    const timer = setInterval(() => { loadExistingHandover(lot.id); }, 5000);
    return () => clearInterval(timer);
  }, [handover, confirmed, lot?.id]);

  function reset() {
    setRefCode(""); setLot(null); setScanError(null);
    setHandover(null); setConfirmed(null);
    setHandoverError(null);
  }

  if (!recycler) return null;

  const condBadgeClass = (c) => c === "GOOD" ? "badge-ok" : c === "FAIR" ? "badge-warn" : "badge-danger";
  const isDisputed = handover?.status === "DISPUTED";

  return (
    <>
      <Nav />
      <main>
        <h1>Verify &amp; Sign</h1>

        {/* ── Phase 4: Confirmed ─────────────────────────────────────────── */}
        {confirmed && (
          <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
            <div style={{ color: "var(--c-primary)", marginBottom: "1rem", display: "flex", justifyContent: "center" }}>
              <Icon name="handshake" size={56} />
            </div>
            <h2 style={{ color: "var(--c-primary)", fontSize: "1.5rem", marginBottom: ".5rem" }}>
              Handover Confirmed
            </h2>
            <p style={{ color: "var(--c-muted)", marginBottom: "1.5rem" }}>
              Ref: <code style={{ background: "#f1f3f5", padding: ".1rem .4rem", borderRadius: "4px" }}>{lot?.reference_code}</code>
            </p>
            <div style={{ fontSize: "2.75rem", fontWeight: "800", color: "var(--c-primary)", marginBottom: "2rem" }}>
              {rupees(confirmed.final_price ?? confirmed.handover?.final_price)}
            </div>
            <button type="button" onClick={reset}>Scan another lot</button>
          </div>
        )}

        {/* ── Phase 3: Awaiting collector ──────────────────────────────────
            No "confirm on behalf of collector" button. The two-sided
            signature is the integrity claim the database enforces
            (handover_confirmed_needs_both_signatures); a button that lets
            one party press both sides makes the constraint decorative and
            the audit trail a fiction. The recycler's job here is to wait,
            so the panel shows the price under negotiation and the state of
            the wait, and refreshes itself. */}
        {!confirmed && handover && (
          <div className="card">
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem" }}>
              <Icon name="hourglass" size={40} color="var(--c-warn)" style={{ marginTop: 2 }} />
              <div>
                <h2 style={{ marginBottom: ".3rem" }}>
                  {isDisputed ? "Collector Disputed the Price" : "Awaiting Collector Signature"}
                </h2>
                <p style={{ color: "var(--c-muted)", fontSize: ".9rem", lineHeight: 1.5 }}>
                  {isDisputed
                    ? "The collector did not agree to this price. The lot is recorded as disputed and is visible in History and Flags."
                    : "The collector sees this on their own device. Only they can sign for their side — this page updates by itself when they do."}
                </p>
              </div>
            </div>

            <dl className="handover-summary">
              <div>
                <dt>Reference</dt>
                <dd><code>{handover.reference_code ?? lot?.reference_code ?? "—"}</code></dd>
              </div>
              <div>
                <dt>Inspected condition</dt>
                <dd>
                  <span className={`badge ${condBadgeClass(handover.inspected_condition)}`}>
                    {handover.inspected_condition ?? "—"}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Final price</dt>
                <dd>{rupees(handover.final_unit_price)} / {lot?.accepted_unit ?? lot?.unit ?? "KG"}</dd>
              </div>
              <div>
                <dt>Total awaiting signature</dt>
                <dd style={{ fontSize: "1.3rem", color: "var(--c-primary)", fontWeight: 800 }}>
                  {rupees(handover.final_total)}
                </dd>
              </div>
            </dl>

            <div className="action-row">
              <button
                type="button"
                className="secondary"
                onClick={() => lot && loadExistingHandover(lot.id)}
              >
                <Icon name="refresh" size={15} /> Check again
              </button>
              <button type="button" className="secondary" onClick={reset}>
                Scan another lot
              </button>
            </div>
          </div>
        )}

        {/* ── Phase 2: Lot details + inspection form ─────────────────────── */}
        {!handover && lot && (
          <div className="split-2">

            {/* Lot details */}
            <div className="card">
              <h2 style={{ marginBottom: "1rem" }}>Lot Details</h2>
              <div style={{ display: "grid", rowGap: "1rem" }}>
                <div>
                  <div style={DT_STYLE}>Category</div>
                  <div style={DD_STYLE}>{lot.category?.nameEn ?? lot.category?.code ?? lot.categoryCode ?? "—"}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <div style={DT_STYLE}>Quantity</div>
                    <div style={DD_STYLE}>{lot.quantity} {lot.unit}</div>
                  </div>
                  <div>
                    <div style={DT_STYLE}>Collector Condition</div>
                    <span className={`badge ${condBadgeClass(lot.condition)}`}>{lot.condition}</span>
                  </div>
                </div>
                {lot.accepted_rate != null && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div>
                      <div style={DT_STYLE}>Accepted Rate</div>
                      <div style={DD_STYLE}>{rupees(lot.accepted_rate)} / {lot.accepted_unit ?? lot.unit}</div>
                    </div>
                    <div>
                      <div style={DT_STYLE}>Estimated Value</div>
                      <div style={{ ...DD_STYLE, fontSize: "1.2rem", color: "var(--c-primary)" }}>
                        {rupees(lot.estimated_value ?? lot.estimatedValue)}
                      </div>
                    </div>
                  </div>
                )}
                {lot.collector && (
                  <div>
                    <div style={DT_STYLE}>Collector ID</div>
                    <div style={{ ...DD_STYLE, fontFamily: "monospace", fontSize: ".85rem" }}>{lot.collector.pseudonym}…</div>
                  </div>
                )}
              </div>
            </div>

            {/* Inspection form */}
            <div className="card">
              <h2 style={{ marginBottom: ".4rem" }}>Physical Inspection</h2>
              <p style={{ color: "var(--c-muted)", fontSize: ".85rem", marginBottom: "1.25rem" }}>
                Select the condition after physical inspection
              </p>

              <HandoverForm lot={lot} onSubmit={handleHandover} submitting={submitting} error={handoverError} />
            </div>
          </div>
        )}

        {/* ── Phase 1: Scan / lookup ─────────────────────────────────────── */}
        {!lot && (
          <div style={{ maxWidth: "440px", margin: "0 auto" }}>
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ color: "var(--c-primary)", marginBottom: ".75rem", display: "flex", justifyContent: "center" }}>
                <Icon name="search" size={40} />
              </div>
              <h2 style={{ marginBottom: ".4rem" }}>Scan Reference Code</h2>
              <p style={{ color: "var(--c-muted)", fontSize: ".9rem", marginBottom: "1.5rem" }}>
                Enter the reference code from the collector's device, or scan the QR code
              </p>

              {/* Fast path: camera scan. Guaranteed path: the form below —
                  it stays visible and functional no matter what the
                  scanner does. */}
              <QrScanner active={!lot} onScan={handleQrScan} />

              <form onSubmit={handleScan}>
                <input
                  type="text"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3D4"
                  style={{ textAlign: "center", fontSize: "1.2rem", letterSpacing: ".15em", fontWeight: "700", marginBottom: ".75rem" }}
                  autoFocus
                />
                {scanError && <p role="alert" style={{ marginBottom: ".75rem" }}>{scanError}</p>}
                <button type="submit" disabled={scanning || !refCode.trim()} style={{ width: "100%", padding: ".7rem", fontSize: "1rem", justifyContent: "center" }}>
                  {scanning ? "Looking up…" : "Look up Lot →"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
