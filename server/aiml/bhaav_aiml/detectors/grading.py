"""Grading detectors. Material quality is a property of the SOURCE, not the
buyer — so the clean discriminator (D9) is whether the same collectors get
graded differently by different recyclers. D10-D12 cover the zero-overlap case,
and D13 flags a single-buyer market rather than a person."""

from __future__ import annotations
from datetime import datetime
from bhaav_aiml.models import Context, Flag, Skip

GRADE = {"GOOD": 3, "FAIR": 2, "POOR": 1}


def _is_downgrade(declared: str, inspected: str | None) -> bool:
    if inspected is None or declared is None:
        return False
    return GRADE.get(inspected, 3) < GRADE.get(declared, 3)


def grader_bias(handovers, lot_by_id, recycler_id) -> float | None:
    """mean over shared collectors of (this recycler's downgrade rate on a
    collector - every other recycler's downgrade rate on that collector).

    Range -1..+1. bias ~ 0 means this recycler grades like everyone else — even
    at a 94% downgrade rate they are exonerated. bias ~ +0.7 means they call
    POOR what others called GOOD, on the same collectors."""
    # Downgrade outcomes per (collector, recycler).
    per: dict[str, dict[str, list[int]]] = {}
    for h in handovers:
        lot = lot_by_id.get(h["lot_id"])
        if not lot:
            continue
        c = lot["collector_id"]
        d = 1 if _is_downgrade(lot["condition"], h.get("inspected_condition")) else 0
        per.setdefault(c, {}).setdefault(h["recycler_id"], []).append(d)

    diffs = []
    for collector, by_rec in per.items():
        if recycler_id not in by_rec:
            continue
        others = [d for r, ds in by_rec.items() if r != recycler_id for d in ds]
        if not others:
            continue  # no overlap on this collector
        mine = sum(by_rec[recycler_id]) / len(by_rec[recycler_id])
        theirs = sum(others) / len(others)
        diffs.append(mine - theirs)

    if not diffs:
        return None
    return sum(diffs) / len(diffs)


def _shared_group(ctx: Context, recycler_id):
    for r in ctx.recyclers:
        if r["id"] == recycler_id:
            return r.get("shared_identity_group")
    return None


def d9_grader_bias(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Compare each recycler's downgrade rate against other recyclers on the
    same collectors. The clean discriminator: a liar downgrades what everyone
    else calls GOOD; an honest low-grade recycler tracks the others."""
    lot_by_id = ctx.lot_by_id()
    recyclers = {h["recycler_id"] for h in ctx.handovers}

    # Count shared collectors: those who sold to more than one recycler.
    collector_recyclers: dict[str, set] = {}
    for h in ctx.handovers:
        lot = lot_by_id.get(h["lot_id"])
        if lot:
            collector_recyclers.setdefault(lot["collector_id"], set()).add(h["recycler_id"])
    shared = {c for c, rs in collector_recyclers.items() if len(rs) >= 2}

    flags: list[Flag] = []
    skipped = None
    for recycler_id in sorted(recyclers):
        # Shared collectors who sold to THIS recycler.
        n_shared = sum(
            1 for c in shared
            if recycler_id in collector_recyclers[c]
        )
        if n_shared < th["D9_min_shared_collectors"]:
            skipped = Skip("D9", f"insufficient overlap: {n_shared} shared collectors for a "
                                 f"recycler, need {th['D9_min_shared_collectors']}")
            continue
        bias = grader_bias(ctx.handovers, lot_by_id, recycler_id)
        if bias is None:
            continue
        if bias > th["D9_bias_warn"]:
            severity = ("CRITICAL" if bias > th["D9_bias_critical"] and n_shared >= th["D9_critical_min_n"]
                        else "WARN")
            detail = {"grader_bias": round(bias, 4), "shared_collectors": n_shared,
                      "threshold": th["D9_bias_warn"]}
            group = _shared_group(ctx, recycler_id)
            if group is not None:
                # Two facilities under one owner are one grader in two hats and
                # will falsely clean each other's score — flag it as a caveat.
                detail["shared_identity_group"] = group
            flags.append(Flag("D9", "RECYCLER", recycler_id, severity, detail))
    return flags, skipped


def d10_downgrade_change_point(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """A recycler at a low downgrade rate for months that jumps did not
    experience a change in material — it experienced a change in policy.

    Splits each recycler's dated handovers at the midpoint of their own active
    window and compares downgrade rates either side. The split is per-recycler
    rather than global because recyclers join at different times, and a global
    midpoint would read a late joiner's whole history as one window.

    D10 is blind to anyone who lied from day one — their rate never steps
    because it was always high. D11 and D12 cover that case.
    """
    lot_by_id = ctx.lot_by_id()

    by_recycler: dict[str, list[tuple[datetime, int]]] = {}
    for h in ctx.handovers:
        lot = lot_by_id.get(h["lot_id"])
        if not lot or not h.get("handover_ts"):
            continue
        ts = datetime.fromisoformat(h["handover_ts"])
        d = 1 if _is_downgrade(lot["condition"], h.get("inspected_condition")) else 0
        by_recycler.setdefault(h["recycler_id"], []).append((ts, d))

    flags: list[Flag] = []
    skipped = None

    for recycler_id, series in sorted(by_recycler.items()):
        if len(series) < th["D10_min_handovers"]:
            skipped = Skip("D10", f"insufficient dated history: {len(series)} handovers for a "
                                  f"recycler, need {th['D10_min_handovers']}")
            continue

        series.sort(key=lambda x: x[0])
        span_days = (series[-1][0] - series[0][0]).days
        if span_days < th["D10_min_days"]:
            skipped = Skip("D10", f"insufficient dated history: {span_days} days for a "
                                  f"recycler, need {th['D10_min_days']}")
            continue

        midpoint = series[0][0] + (series[-1][0] - series[0][0]) / 2
        preceding = [d for ts, d in series if ts < midpoint]
        trailing = [d for ts, d in series if ts >= midpoint]

        if (len(preceding) < th["D10_min_per_window"]
                or len(trailing) < th["D10_min_per_window"]):
            skipped = Skip("D10", "handovers too unevenly distributed to split into windows")
            continue

        prec_rate = sum(preceding) / len(preceding)
        trail_rate = sum(trailing) / len(trailing)
        step = trail_rate - prec_rate

        if step >= th["D10_step"]:
            flags.append(Flag("D10", "RECYCLER", recycler_id, "WARN", {
                "trailing_rate": round(trail_rate, 4),
                "preceding_rate": round(prec_rate, 4),
                "step": round(step, 4),
                "n_trailing": len(trailing),
                "n_preceding": len(preceding),
                "threshold": th["D10_step"],
            }))

    return flags, skipped


def d11_cross_category_uniformity(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Genuine quality problems are category-specific; lying is uniform. Compare
    the variance of downgrade rate across a recycler's categories. Near-zero
    variance at a high mean rate is implausible on physical grounds."""
    lot_by_id = ctx.lot_by_id()
    per: dict[str, dict[str, list[int]]] = {}
    for h in ctx.handovers:
        lot = lot_by_id.get(h["lot_id"])
        if not lot:
            continue
        d = 1 if _is_downgrade(lot["condition"], h.get("inspected_condition")) else 0
        per.setdefault(h["recycler_id"], {}).setdefault(lot["category_id"], []).append(d)

    from bhaav_aiml.stats import pvariance
    flags: list[Flag] = []
    had_data = False
    for recycler_id, by_cat in per.items():
        cats = {c: ds for c, ds in by_cat.items() if len(ds) >= th["D11_min_per_category"]}
        if len(cats) < th["D11_min_categories"]:
            continue
        had_data = True
        rates = [sum(ds) / len(ds) for ds in cats.values()]
        var = pvariance(rates)
        mean_rate = sum(rates) / len(rates)
        if var is not None and var <= th["D11_variance_max"] and mean_rate >= th["D11_mean_min"]:
            flags.append(Flag("D11", "RECYCLER", recycler_id, "WARN",
                              {"categories": len(cats), "variance": round(var, 4),
                               "mean_rate": round(mean_rate, 4)}))
    return flags, (None if had_data else Skip("D11", "insufficient per-category handovers"))


def d12_offers_never_learn(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Someone genuinely receiving poor material lowers their published rate;
    someone lying cannot, because the high rate is what wins the lot.

    Two conditions must hold together: a persistent gap between published and
    paid, AND a published rate that has not fallen. Either alone is innocent —
    a large gap with a falling rate is a recycler correcting course, and a flat
    rate with no gap is a recycler who simply pays what they advertise.

    This is the detector that makes the separating equilibrium legible: the
    honest low-grade recycler declares by dropping their rate and is exonerated;
    the liar cannot drop theirs without losing the lots that are the whole point.
    """
    acc_by_lot = ctx.acceptance_by_lot()

    drops: dict[str, list[float]] = {}
    stamps: dict[str, list[datetime]] = {}
    for h in ctx.handovers:
        if h.get("status") != "CONFIRMED":
            continue
        a = acc_by_lot.get(h["lot_id"])
        if not a or not a["accepted_rate"]:
            continue
        drops.setdefault(h["recycler_id"], []).append(
            1.0 - (h["final_unit_price"] / a["accepted_rate"])
        )
        if h.get("handover_ts"):
            stamps.setdefault(h["recycler_id"], []).append(
                datetime.fromisoformat(h["handover_ts"])
            )

    # Published-rate trajectory per recycler, averaged across their categories so
    # a recycler dealing in more categories is not weighted differently.
    series: dict[str, dict[str, list[dict]]] = {}
    for r in ctx.rates:
        series.setdefault(r["recycler_id"], {}).setdefault(r["category_id"], []).append(r)

    def rate_fall(recycler_id: str) -> float | None:
        """Fraction by which this recycler's published rate fell across the
        window. Positive means they lowered it."""
        falls = []
        for rows in series.get(recycler_id, {}).values():
            rows = sorted(rows, key=lambda x: x["valid_from"])
            if len(rows) < 2 or not rows[0]["price"]:
                continue
            falls.append((rows[0]["price"] - rows[-1]["price"]) / rows[0]["price"])
        return sum(falls) / len(falls) if falls else None

    flags: list[Flag] = []
    skipped = None

    for recycler_id, ds in sorted(drops.items()):
        if len(ds) < th["D12_min_handovers"]:
            skipped = Skip("D12", f"insufficient series: {len(ds)} confirmed handovers for a "
                                  f"recycler, need {th['D12_min_handovers']}")
            continue

        ts = sorted(stamps.get(recycler_id, []))
        span_days = (ts[-1] - ts[0]).days if len(ts) >= 2 else 0
        if span_days < th["D12_min_days"]:
            skipped = Skip("D12", f"insufficient series: {span_days} days for a recycler, "
                                  f"need {th['D12_min_days']}")
            continue

        fall = rate_fall(recycler_id)
        if fall is None:
            skipped = Skip("D12", "no published-rate series to trend")
            continue

        mean_drop = sum(ds) / len(ds)

        # Persistent gap AND a rate that has not meaningfully fallen.
        if mean_drop >= th["D12_flat_drop_min"] and fall < th["D12_rate_fall_max"]:
            flags.append(Flag("D12", "RECYCLER", recycler_id, "WARN", {
                "mean_drop": round(mean_drop, 4),
                "rate_trend": round(fall, 4),
                "n_handovers": len(ds),
                "span_days": span_days,
                "threshold": th["D12_flat_drop_min"],
            }))

    return flags, skipped


def d13_single_buyer_market(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """When a district has one valid recycler and a high downgrade rate, the
    correct output is a MARKET finding, not a person — recycler bias is not
    identifiable there (AI-ANOMALY-SPEC section 6.3 D13)."""
    lot_by_id = ctx.lot_by_id()
    by_recycler: dict[str, list[dict]] = {}
    for h in ctx.handovers:
        by_recycler.setdefault(h["recycler_id"], []).append(h)

    flags: list[Flag] = []
    for r in ctx.recyclers:
        if r.get("district_valid_recycler_count") != 1:
            continue
        hs = by_recycler.get(r["id"], [])
        if len(hs) < th["D13_min_handovers"]:
            continue
        downs = sum(1 for h in hs if _is_downgrade(lot_by_id.get(h["lot_id"], {}).get("condition"),
                                                   h.get("inspected_condition")))
        rate = downs / len(hs)
        if rate >= th["D13_downgrade_rate"]:
            flags.append(Flag("D13", "MARKET", f"district:{r['district']}", "WARN",
                              {"valid_recyclers": 1, "downgrade_rate": round(rate, 4),
                               "n": len(hs), "district": r["district"],
                               "reason": "single-buyer market — recycler bias not identifiable"}))
    return flags, None
