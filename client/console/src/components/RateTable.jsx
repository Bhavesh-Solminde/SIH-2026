"use client";
import { useState } from "react";
import { t } from "../lib/labels.js";

export default function RateTable({ rows, onPublish }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(rows.map((r) => [r.categoryCode, { price: r.price ?? "", unit: r.unit ?? r.defaultUnit ?? "KG" }])),
  );

  const set = (code, patch) => setDraft((d) => ({ ...d, [code]: { ...d[code], ...patch } }));

  function publish() {
    // Only rows with a price set are published. Publishing INSERTS new rate
    // rows — it never updates — so the price history accumulates (SERVER.md §3.4).
    const out = rows
      .map((r) => ({ categoryCode: r.categoryCode, unit: draft[r.categoryCode].unit, price: draft[r.categoryCode].price }))
      .filter((r) => r.price !== "" && r.price !== null)
      .map((r) => ({ ...r, price: Number(r.price) }));
    onPublish(out);
  }

  function copyExisting() {
    setDraft(Object.fromEntries(rows.map((r) => [r.categoryCode, { price: r.price ?? "", unit: r.unit ?? "KG" }])));
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Material</th>
            <th>Rate (₹/unit)</th>
            <th>Unit</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.categoryCode}>
              <td>{r.nameEn}</td>
              <td>
                <input
                  aria-label={`price-${r.categoryCode}`}
                  type="number"
                  min="0"
                  value={draft[r.categoryCode].price}
                  onChange={(e) => set(r.categoryCode, { price: e.target.value })}
                />
              </td>
              <td>
                <select
                  aria-label={`unit-${r.categoryCode}`}
                  value={draft[r.categoryCode].unit}
                  onChange={(e) => set(r.categoryCode, { unit: e.target.value })}
                >
                  <option value="KG">KG</option>
                  <option value="PIECE">PIECE</option>
                </select>
              </td>
              <td>
                {r.lastUpdatedDays === null ? "—" : `${r.lastUpdatedDays}d`}
                {r.stale && <span data-testid={`stale-${r.categoryCode}`} title="over 7 days"> ⚠</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={copyExisting}>
        Copy current rates
      </button>
      <button type="button" onClick={publish}>
        {t("publish")}
      </button>
    </div>
  );
}
