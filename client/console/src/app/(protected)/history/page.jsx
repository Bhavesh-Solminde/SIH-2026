"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { rupees, shortDate } from "../../../lib/format.js";
import Icon from "../../../components/Icon.jsx";

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const recycler = useSession();
  const [handovers, setHandovers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(
    async (p = 0) => {
      const res = await api.get(`/recycler/history?page=${p}&limit=${PAGE_SIZE}`);
      // Server (server/api/src/routes/recycler.js GET /history) returns
      // { data, page, totalPages, total } — not { handovers }. The `data`/
      // `handovers` double fallback here is defensive against either shape.
      const rows = res.data ?? res.handovers ?? [];
      setHandovers(rows);
      setTotal(res.total ?? rows.length);
    },
    []
  );

  useEffect(() => {
    if (recycler) load(page);
  }, [recycler, page, load]);

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.getBlob("/recycler/history?format=csv");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "history.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  if (!recycler) return null;

  return (
    <>
      <Nav />
      <main>
        <h1>History</h1>
        <button type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>

        {handovers.length === 0 && <p className="empty-state"><Icon name="box" /> No handovers yet.</p>}

        {handovers.length > 0 && (
          <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Lot ref</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Inspected condition</th>
                <th>Final price</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {handovers.map((h) => {
                // downgrade_reason_code is only ever set when the collector's
                // declared condition didn't survive inspection — a direct,
                // server-computed signal, rather than comparing two condition
                // fields this endpoint doesn't both return.
                const downgraded = h.downgrade_reason_code != null;
                return (
                  <tr
                    key={h.id}
                    data-downgraded={downgraded || undefined}
                  >
                    <td>{h.lot_ref ?? h.reference_code}</td>
                    <td>{h.category_name ?? h.category_code ?? h.category}</td>
                    <td>{h.inspected_quantity ?? h.quantity}</td>
                    <td>{h.inspected_condition}</td>
                    <td>{rupees(h.final_total ?? h.agreed_price)}</td>
                    <td>{shortDate(h.handover_ts ?? h.date ?? h.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        {totalPages > 1 && (
          <div>
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
            >
              Prev
            </button>
            <span>
              {" "}
              Page {page + 1} of {totalPages}{" "}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
            >
              Next
            </button>
          </div>
        )}
      </main>
    </>
  );
}
