"use client";
import { useEffect, useState, useCallback } from "react";
import Nav from "../../../components/Nav.jsx";
import { useSession } from "../../../lib/useSession.js";
import { api } from "../../../lib/api.js";
import { rupees, shortDate } from "../../../lib/format.js";

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const recycler = useSession();
  const [handovers, setHandovers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(
    async (p = 0) => {
      const data = await api.get(`/recycler/history?page=${p}&limit=${PAGE_SIZE}`);
      setHandovers(data.handovers ?? data);
      setTotal(data.total ?? (data.handovers ?? data).length);
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

        {handovers.length === 0 && <p>No handovers yet.</p>}

        {handovers.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Lot ref</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Declared condition</th>
                <th>Inspected condition</th>
                <th>Collector estimate</th>
                <th>Agreed price</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {handovers.map((h) => {
                const downgraded = h.inspected_condition !== h.declared_condition;
                return (
                  <tr
                    key={h.id}
                    data-downgraded={downgraded || undefined}
                    style={downgraded ? { background: "#fff3cd" } : undefined}
                  >
                    <td>{h.lot_ref ?? h.reference_code}</td>
                    <td>{h.category}</td>
                    <td>
                      {h.quantity} {h.unit}
                    </td>
                    <td>{h.declared_condition}</td>
                    <td>{h.inspected_condition}</td>
                    <td>{rupees(h.collector_estimate)}</td>
                    <td>{rupees(h.agreed_price)}</td>
                    <td>{shortDate(h.date ?? h.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
