from bhaav_aiml.models import Context
from bhaav_aiml.config import THRESHOLDS
from bhaav_aiml.detectors.grading import (
    d9_grader_bias, d10_downgrade_change_point, d13_single_buyer_market, grader_bias,
)
from bhaav_aiml.simulate import simulate

GRADE = {"GOOD": 3, "FAIR": 2, "POOR": 1}


def hand(lot_id, recycler, declared, inspected):
    return {"id": f"h-{lot_id}", "lot_id": lot_id, "recycler_id": recycler,
            "inspected_condition": inspected, "status": "CONFIRMED"}


def lot(lot_id, collector, declared):
    return {"id": lot_id, "collector_id": collector, "condition": declared, "category_id": "cat1"}


def build(records):
    lots, handovers = [], []
    for lot_id, collector, recycler, declared, inspected in records:
        lots.append(lot(lot_id, collector, declared))
        handovers.append(hand(lot_id, recycler, declared, inspected))
    return Context("2026-09-02T18:00:00+05:30", [], [], [], lots, [], handovers)


def test_liar_and_honest_low_grade_are_separated_by_d9():
    # The pair that matters (AI-ANOMALY-SPEC section 8). Both pay low and both
    # cite POOR_CONDITION; D2 flags both. Only D9 separates them.
    records = []
    # 12 shared collectors, each sells to the liar (r_lie) and to two honest
    # recyclers who grade them GOOD.
    for i in range(12):
        c = f"col{i}"
        records.append((f"lie{i}", c, "r_lie", "GOOD", "POOR"))   # liar downgrades everyone
        records.append((f"h1_{i}", c, "r_hon1", "GOOD", "GOOD"))  # others agree the material is good
        records.append((f"h2_{i}", c, "r_hon2", "GOOD", "GOOD"))
    ctx = build(records)

    bias_lie = grader_bias(ctx.handovers, ctx.lot_by_id(), "r_lie")
    bias_hon = grader_bias(ctx.handovers, ctx.lot_by_id(), "r_hon1")
    # The liar downgrades what everyone else calls GOOD → high positive bias.
    assert bias_lie > 0.6
    # The honest recycler grades at or below the cross-recycler average — never
    # above the WARN threshold (0.35). Negative values are fine: they grade
    # slightly BETTER than the average, which is inflated by the liar.
    assert bias_hon < THRESHOLDS["D9_bias_warn"]

    flags, skip = d9_grader_bias(ctx, THRESHOLDS)
    assert skip is None
    lie_flags = [f for f in flags if f.subject_id == "r_lie"]
    assert len(lie_flags) == 1
    assert lie_flags[0].severity in ("WARN", "CRITICAL")
    # The honest low-grade recycler is NOT flagged by D9.
    assert not any(f.subject_id == "r_hon1" for f in flags)


def test_d9_skips_without_enough_overlap():
    records = [(f"l{i}", f"col{i}", "r1", "GOOD", "POOR") for i in range(3)]
    ctx = build(records)
    flags, skip = d9_grader_bias(ctx, THRESHOLDS)
    assert flags == []
    assert skip is not None
    assert "overlap" in skip.reason.lower()


def test_d9_carries_the_shared_ownership_caveat():
    # Two recyclers in one identity group are one grader in two hats; the caveat
    # must ride in detail (AI-ANOMALY-SPEC edge case 23).
    records = []
    for i in range(12):
        records.append((f"a{i}", f"col{i}", "r_a", "GOOD", "POOR"))
        records.append((f"b{i}", f"col{i}", "r_b", "GOOD", "GOOD"))
        records.append((f"c{i}", f"col{i}", "r_c", "GOOD", "GOOD"))
    ctx = Context(
        "2026-09-02T18:00:00+05:30", [],
        [{"id": "r_a", "shared_identity_group": "grp0"},
         {"id": "r_b", "shared_identity_group": None},
         {"id": "r_c", "shared_identity_group": None}],
        [], [lot(l, c, d) for (l, c, _r, d, _i) in records],
        [], [hand(l, r, d, i) for (l, c, r, d, i) in records],
    )
    flags, _ = d9_grader_bias(ctx, THRESHOLDS)
    a_flags = [f for f in flags if f.subject_id == "r_a"]
    assert a_flags and a_flags[0].detail.get("shared_identity_group") == "grp0"


def test_d13_flags_a_single_buyer_district():
    recyclers = [{"id": "only", "district": "Buldhana", "district_valid_recycler_count": 1}]
    handovers = [hand(f"l{i}", "only", "GOOD", "POOR") for i in range(25)]
    lots = [lot(f"l{i}", f"col{i}", "GOOD") for i in range(25)]
    ctx = Context("2026-09-02T18:00:00+05:30", [], recyclers, [], lots, [], handovers)
    flags, _ = d13_single_buyer_market(ctx, THRESHOLDS)
    assert len(flags) == 1
    assert flags[0].subject_type == "MARKET"
    assert flags[0].subject_id == "district:Buldhana"


def test_d10_flags_a_recycler_whose_downgrade_rate_steps_up():
    """late_onset_liar is honest for the first half then switches. That is a
    change in policy, not a change in material, and D10 is the detector built
    for exactly that profile."""
    # ground_truth lives on the simulate() body, not on Context — Context
    # deliberately carries only what a detector may read.
    body = simulate({
        "seed": 5, "days": 180, "n_lots": 400, "n_collectors": 12, "n_recyclers": 3,
        "recycler_profiles": {"late_onset_liar": 1, "honest": 2},
    })
    ctx = Context.from_request(body)
    liar = next(g["recycler_id"] for g in body["ground_truth"]
                if g.get("profile") == "late_onset_liar")

    flags, skipped = d10_downgrade_change_point(ctx, THRESHOLDS)

    assert liar in [f.subject_id for f in flags]


def test_d10_leaves_a_consistently_honest_recycler_alone():
    ctx = Context.from_request(simulate({
        "seed": 5, "days": 180, "n_lots": 400, "n_collectors": 12, "n_recyclers": 3,
        "recycler_profiles": {"honest": 3},
    }))

    flags, skipped = d10_downgrade_change_point(ctx, THRESHOLDS)

    assert flags == []


def test_d10_skips_with_a_reason_when_history_is_too_short():
    """Skip-with-reason, never a silent empty result: an operator must be able
    to tell 'nothing wrong' from 'could not run'."""
    ctx = Context.from_request(simulate({
        "seed": 5, "days": 10, "n_lots": 20, "n_recyclers": 2,
    }))

    flags, skipped = d10_downgrade_change_point(ctx, THRESHOLDS)

    assert flags == []
    assert skipped is not None
    assert "history" in skipped.reason.lower() or "handover" in skipped.reason.lower()
