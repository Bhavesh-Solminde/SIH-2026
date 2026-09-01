from bhaav_aiml.models import Context
from bhaav_aiml.config import THRESHOLDS
from bhaav_aiml.detectors.price import (
    d1_price_deviation,
    d2_systematic_underpayment,
    d3_bait_pricing,
)


def ctx(handovers=None, acceptances=None, rates=None):
    return Context(
        as_of="2026-09-02T18:00:00+05:30",
        categories=[],
        recyclers=[],
        rates=rates or [],
        lots=[],
        acceptances=acceptances or [],
        handovers=handovers or [],
    )


def acc(lot_id, rate, recycler="r1"):
    return {"id": f"a-{lot_id}", "lot_id": lot_id, "recycler_id": recycler, "accepted_rate": rate}


def hand(lot_id, unit_price, recycler="r1", status="CONFIRMED"):
    return {"id": f"h-{lot_id}", "lot_id": lot_id, "recycler_id": recycler,
            "final_unit_price": unit_price, "status": status}


def test_d1_flags_a_large_deviation_as_info_only():
    c = ctx(handovers=[hand("l1", 300)], acceptances=[acc("l1", 420)])
    flags, skip = d1_price_deviation(c, THRESHOLDS)
    assert skip is None
    assert len(flags) == 1
    assert flags[0].severity == "INFO"  # never rises above INFO on its own
    assert flags[0].detail["deviation"] > 0.25


def test_d1_does_not_flag_a_small_deviation():
    c = ctx(handovers=[hand("l1", 410)], acceptances=[acc("l1", 420)])
    flags, _ = d1_price_deviation(c, THRESHOLDS)
    assert flags == []


def test_d2_skips_below_the_minimum():
    c = ctx(
        handovers=[hand(f"l{i}", 300) for i in range(4)],
        acceptances=[acc(f"l{i}", 420) for i in range(4)],
    )
    flags, skip = d2_systematic_underpayment(c, THRESHOLDS)
    assert flags == []
    assert skip is not None
    assert "need 10" in skip.reason


def test_d2_flags_a_recycler_whose_median_ratio_is_low():
    # 12 handovers all paying 78% of the published rate.
    handovers = [hand(f"l{i}", 327.6) for i in range(12)]  # 327.6 / 420 = 0.78
    acceptances = [acc(f"l{i}", 420) for i in range(12)]
    c = ctx(handovers=handovers, acceptances=acceptances)
    flags, skip = d2_systematic_underpayment(c, THRESHOLDS)
    assert skip is None
    assert len(flags) == 1
    assert flags[0].subject_type == "RECYCLER"
    assert flags[0].detail["median_ratio"] < 0.85
    assert flags[0].detail["n"] == 12


def test_d2_leaves_an_honest_recycler_alone():
    handovers = [hand(f"l{i}", 420) for i in range(12)]
    acceptances = [acc(f"l{i}", 420) for i in range(12)]
    flags, _ = d2_systematic_underpayment(ctx(handovers=handovers, acceptances=acceptances), THRESHOLDS)
    assert flags == []


def test_d3_skips_without_seven_days_of_history():
    rates = [{"recycler_id": "r1", "category_id": "c1", "price": 420,
              "valid_from": "2026-09-01T09:00:00+05:30"}]
    flags, skip = d3_bait_pricing(ctx(rates=rates), THRESHOLDS)
    assert flags == []
    assert skip is not None
