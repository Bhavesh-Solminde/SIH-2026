"""Grading detectors. Material quality is a property of the SOURCE, not the
buyer — so the clean discriminator (D9) is whether the same collectors get
graded differently by different recyclers. D10-D12 cover the zero-overlap case,
and D13 flags a single-buyer market rather than a person."""

from __future__ import annotations
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
    experience a change in material — it experienced a change in policy. Needs
    handover timestamps; skips if history is thin.

    D10 is blind to anyone who lied from day one; D11 and D12 cover that case.
    Skeleton skips with a reason until dated history from the simulator
    provides the trailing-30 vs preceding-90 series it needs."""
    return [], Skip("D10", "insufficient dated history for a change-point test")


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
    someone lying cannot, because the high rate is what wins the lot. Regress
    offer_to_final_drop against time: persistently high and flat is the
    economic tell. Skips until the simulator produces the rate/handover series
    it needs (AI-ANOMALY-SPEC section 6.3 D12)."""
    return [], Skip("D12", "insufficient rate-and-handover series for a trend test")


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
