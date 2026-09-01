"""Provenance detectors over the two geotags and two timestamps. All fire from
the first transaction — no history needed."""

from __future__ import annotations
from datetime import datetime
from bhaav_aiml.models import Context, Flag, Skip
from bhaav_aiml.geo import haversine_km, implied_kmph


def d6_duplicate_lot(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Same collector, same category, quantity within tolerance, within a short
    window — the shape of the same material double-counted."""
    flags: list[Flag] = []
    by_key: dict[tuple[str, str], list[dict]] = {}
    for lot in ctx.lots:
        by_key.setdefault((lot["collector_id"], lot["category_id"]), []).append(lot)

    tol = th["D6_quantity_tolerance"]
    window = th["D6_window_minutes"] * 60
    for lots in by_key.values():
        lots = sorted(lots, key=lambda l: l["collection_ts"])
        for i in range(1, len(lots)):
            a, b = lots[i - 1], lots[i]
            if a["quantity"] == 0:
                continue
            close_qty = abs(b["quantity"] - a["quantity"]) / a["quantity"] <= tol
            secs = (datetime.fromisoformat(b["collection_ts"])
                    - datetime.fromisoformat(a["collection_ts"])).total_seconds()
            if close_qty and secs <= window:
                flags.append(Flag("D6", "LOT", b["id"], "WARN",
                                  {"quantity_tolerance": tol, "minutes_apart": round(secs / 60, 1)}))
    return flags, None


def d7_impossible_travel(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Implied speed between collection point and handover point exceeds
    threshold — fabricated provenance."""
    lot_by_id = ctx.lot_by_id()
    flags: list[Flag] = []
    for h in ctx.handovers:
        lot = lot_by_id.get(h["lot_id"])
        if not lot:
            continue
        kmph = implied_kmph(
            (lot.get("collection_lat"), lot.get("collection_lng")),
            (h.get("handover_lat"), h.get("handover_lng")),
            lot["collection_ts"], h["handover_ts"],
        )
        if kmph is not None and kmph > th["D7_kmph"]:
            km = haversine_km((lot["collection_lat"], lot["collection_lng"]),
                              (h["handover_lat"], h["handover_lng"]))
            flags.append(Flag("D7", "HANDOVER", h["id"], "WARN",
                              {"implied_kmph": round(kmph, 1), "distance_km": round(km, 2),
                               "threshold": th["D7_kmph"]}))
    return flags, None


def d8_clustered_handovers(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """N handovers within a few seconds at one point — bulk-fabricated records."""
    by_recycler: dict[str, list[dict]] = {}
    for h in ctx.handovers:
        if h.get("handover_lat") is None:
            continue
        by_recycler.setdefault(h["recycler_id"], []).append(h)

    flags: list[Flag] = []
    for recycler_id, rows in by_recycler.items():
        rows = sorted(rows, key=lambda h: h["handover_ts"])
        for i in range(len(rows)):
            cluster = [rows[i]]
            for j in range(i + 1, len(rows)):
                secs = (datetime.fromisoformat(rows[j]["handover_ts"])
                        - datetime.fromisoformat(rows[i]["handover_ts"])).total_seconds()
                if secs > th["D8_window_seconds"]:
                    break
                d = haversine_km((rows[i]["handover_lat"], rows[i]["handover_lng"]),
                                 (rows[j]["handover_lat"], rows[j]["handover_lng"]))
                if d is not None and d * 1000 <= th["D8_radius_m"]:
                    cluster.append(rows[j])
            if len(cluster) >= th["D8_count"]:
                flags.append(Flag("D8", "RECYCLER", recycler_id, "CRITICAL",
                                  {"count": len(cluster), "seconds": th["D8_window_seconds"],
                                   "radius_m": th["D8_radius_m"]}))
                break
    return flags, None
