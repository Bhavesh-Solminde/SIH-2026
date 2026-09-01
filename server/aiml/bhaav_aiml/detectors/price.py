"""Price detectors over the three-price structure. Every detector operates on
RATIOS and deviations, never on absolute rupees (AI-ANOMALY-SPEC gap 2): PCB is
190/kg and cable 40/kg, so one threshold covers all categories only if the
comparison is a ratio."""

from __future__ import annotations
from datetime import datetime
from bhaav_aiml.models import Context, Flag, Skip
from bhaav_aiml.stats import median


def d1_price_deviation(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Per-handover deviation of paid from published. INFO only — a single gap
    is usually a negotiation after inspection (AI.md section 5)."""
    acc_by_lot = ctx.acceptance_by_lot()
    flags: list[Flag] = []
    for h in ctx.handovers:
        a = acc_by_lot.get(h["lot_id"])
        if not a or not a["accepted_rate"]:
            continue
        dev = abs(h["final_unit_price"] - a["accepted_rate"]) / a["accepted_rate"]
        if dev > th["D1_deviation"]:
            flags.append(Flag("D1", "HANDOVER", h["id"], "INFO",
                              {"deviation": round(dev, 4), "threshold": th["D1_deviation"]}))
    return flags, None


def d2_systematic_underpayment(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Median paid/published ratio per recycler. The strongest detector — but
    it flags an honest low-grade recycler exactly like a lying one, which is
    what D9 exists to separate."""
    acc_by_lot = ctx.acceptance_by_lot()
    by_recycler: dict[str, list[float]] = {}
    for h in ctx.handovers:
        if h.get("status") != "CONFIRMED":
            continue
        a = acc_by_lot.get(h["lot_id"])
        if not a or not a["accepted_rate"]:
            continue
        by_recycler.setdefault(h["recycler_id"], []).append(h["final_unit_price"] / a["accepted_rate"])

    flags: list[Flag] = []
    skipped = None
    for recycler_id, ratios in by_recycler.items():
        if len(ratios) < th["D2_min_handovers"]:
            # The minimum-data precondition is enforced here, so the detector
            # physically cannot fire on data too thin to support it.
            skipped = Skip("D2", f"insufficient data: {len(ratios)} handovers for a recycler, "
                                 f"need {th['D2_min_handovers']}")
            continue
        m = median(ratios)
        if m < th["D2_ratio"]:
            flags.append(Flag("D2", "RECYCLER", recycler_id, "WARN",
                              {"median_ratio": round(m, 4), "n": len(ratios), "threshold": th["D2_ratio"]}))
    return flags, skipped


def d3_bait_pricing(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """A published rate that spikes to win the ranking and reverts within a few
    days. Needs at least seven days of rate history per recycler+category."""
    series: dict[tuple[str, str], list[dict]] = {}
    for r in ctx.rates:
        series.setdefault((r["recycler_id"], r["category_id"]), []).append(r)

    flags: list[Flag] = []
    have_history = False
    for (recycler_id, _cat), rows in series.items():
        rows = sorted(rows, key=lambda r: r["valid_from"])
        if len(rows) < 2:
            continue
        span_days = (datetime.fromisoformat(rows[-1]["valid_from"])
                     - datetime.fromisoformat(rows[0]["valid_from"])).days
        if span_days < th["D3_min_history_days"]:
            continue
        have_history = True
        for i in range(1, len(rows) - 1):
            prev, cur, nxt = rows[i - 1]["price"], rows[i]["price"], rows[i + 1]["price"]
            if prev == 0:
                continue
            up = (cur - prev) / prev
            reverted = abs(nxt - prev) / prev < 0.05
            hours = (datetime.fromisoformat(rows[i + 1]["valid_from"])
                     - datetime.fromisoformat(rows[i]["valid_from"])).total_seconds() / 3600.0
            if up > th["D3_change"] and reverted and hours <= th["D3_revert_hours"]:
                flags.append(Flag("D3", "RECYCLER", recycler_id, "WARN",
                                  {"change": round(up, 4), "revert_hours": round(hours, 1),
                                   "threshold": th["D3_change"]}))
    skip = None if have_history else Skip("D3", f"insufficient rate history: need "
                                                f"{th['D3_min_history_days']} days per recycler")
    return flags, skip
