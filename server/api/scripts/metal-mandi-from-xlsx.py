#!/usr/bin/env python3
"""
Regenerate server/metal_mandi_reference_prices.csv from the Metal Mandi workbook.

    python3 server/api/scripts/metal-mandi-from-xlsx.py "server/aiml/Metal_mandi (1).xlsx"

Stdlib only — an xlsx is a zip of XML, and adding openpyxl to a repo that has
one spreadsheet to read is not worth the dependency.

THE reference_id SCHEME IS LOAD-BEARING. metalMandiCategoryMap.js pins app
categories to specific REF ids, so the numbering here is not free to change:

  * PIECE-priced rows are DROPPED. The workbook prices AC Split, AC Window,
    Fridge and Washing Machine both per-pcs and per-kg (27 pcs rows). Every
    app category that resolves is priced per KG, and mixing units into one
    id sequence would make REF0xx ambiguous about which unit it names.
  * The surviving kg rows are numbered REF001..REF118 in sheet order.

That is the scheme the existing map was written against, verified against every
id it cites (E-Waste REF042-044, Wires & Cables REF081-085, HDD Magnet REF087,
Li-ion UPS REF100, PCB Scrap REF101-115, Displays & Panels REF116-118). If a
future workbook adds or reorders rows, the ids shift and the map must be
re-checked — it is a hand-made mapping, not a computed one.

Change (%) is stored as a fraction in the workbook (0.0002 = 0.02%), so it is
multiplied by 100 on the way out. reference_price_pct lands in a DECIMAL(8,2)
column; left as a fraction every value would round to 0.00.
"""
import csv
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

OUT_COLUMNS = [
    "reference_id", "Category", "Item", "Specification", "Unit",
    "reference_price", "price_change_pct", "critical_materials",
]

# Workbook headers, in the order this script expects to find them.
IN_COLUMNS = [
    "Category", "Item", "Specification", "Unit",
    "Price (INR)", "Change (%)", "Critical Minerals / Metals",
]


def column_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_sheet(path):
    """Yield the workbook's first sheet as a list of string cells per row."""
    z = zipfile.ZipFile(path)

    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))

    rows = []
    root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    for row in root.iter(f"{NS}row"):
        cells = {}
        for c in row.findall(f"{NS}c"):
            idx = column_index(c.get("r")) if c.get("r") else len(cells)
            if c.get("t") == "s":
                v = c.find(f"{NS}v")
                cells[idx] = shared[int(v.text)] if v is not None else ""
            elif c.get("t") == "inlineStr":
                is_el = c.find(f"{NS}is")
                cells[idx] = "".join(x.text or "" for x in is_el.iter(f"{NS}t")) if is_el is not None else ""
            else:
                v = c.find(f"{NS}v")
                cells[idx] = v.text if v is not None else ""
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows


def number(raw, places):
    if raw in (None, ""):
        return ""
    return f"{float(raw):.{places}f}"


def price(raw, warnings):
    """
    A price cell is normally a number. One row in the source workbook
    ('Brass Scrap / Purja') states a RANGE — '852-892' — and the column has to
    hold a single Decimal. The midpoint of a range published by the source is
    a defensible reading of that source, unlike averaging several distinct
    items together, which is a methodology decision this pipeline refuses to
    make (see metalMandiCategoryMap.js). Every collapse is reported so it is
    visible rather than silent.
    """
    raw = (raw or "").strip()
    if not raw:
        return ""
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)", raw)
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        mid = (lo + hi) / 2
        warnings.append(f"range {raw!r} collapsed to its midpoint {mid:.2f}")
        return f"{mid:.2f}"
    return number(raw, 2)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    xlsx = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else (
        Path(__file__).resolve().parents[2] / "metal_mandi_reference_prices.csv"
    )

    rows = read_sheet(xlsx)
    header, body = rows[0], rows[1:]
    if [h.strip() for h in header[:len(IN_COLUMNS)]] != IN_COLUMNS:
        sys.exit(f"unexpected workbook columns: {header}\nexpected: {IN_COLUMNS}")

    kept, dropped, warnings = [], 0, []
    for r in body:
        r = r + [""] * (len(IN_COLUMNS) - len(r))
        category, item, spec, unit, raw_price, change, minerals = r[:7]
        if unit.strip().lower() != "kg":
            dropped += 1
            continue
        notes = []
        kept.append({
            "reference_id": f"REF{len(kept) + 1:03d}",
            "Category": category.strip(),
            "Item": item.strip(),
            "Specification": spec.strip(),
            "Unit": unit.strip().upper(),
            "reference_price": price(raw_price, notes),
            "price_change_pct": number(float(change) * 100 if change else "", 2) if change else "",
            "critical_materials": ", ".join(
                m.strip() for m in minerals.split(",") if m.strip()
            ),
        })
        warnings += [f"{kept[-1]['reference_id']} ({item.strip()}): {n}" for n in notes]

    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=OUT_COLUMNS)
        w.writeheader()
        w.writerows(kept)

    print(f"{out}: {len(kept)} kg rows written (REF001..REF{len(kept):03d}), {dropped} non-kg rows dropped")
    for warning in warnings:
        print(f"  ! {warning}")


if __name__ == "__main__":
    main()
