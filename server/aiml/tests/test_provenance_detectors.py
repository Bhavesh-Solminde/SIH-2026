from bhaav_aiml.models import Context
from bhaav_aiml.config import THRESHOLDS
from bhaav_aiml.detectors.provenance import (
    d6_duplicate_lot,
    d7_impossible_travel,
    d8_clustered_handovers,
)


def ctx(lots=None, handovers=None):
    return Context("2026-09-02T18:00:00+05:30", [], [], [], lots or [], [], handovers or [])


def lot(id, collector, category, qty, ts, lat=19.39, lng=72.83):
    return {"id": id, "collector_id": collector, "category_id": category, "quantity": qty,
            "collection_lat": lat, "collection_lng": lng, "collection_ts": ts}


def test_d6_flags_two_near_identical_lots_minutes_apart():
    lots = [
        lot("l1", "c1", "cat1", 3.0, "2026-09-02T10:00:00+05:30"),
        lot("l2", "c1", "cat1", 3.02, "2026-09-02T10:05:00+05:30"),
    ]
    flags, _ = d6_duplicate_lot(ctx(lots=lots), THRESHOLDS)
    assert len(flags) == 1
    assert flags[0].detector_code == "D6"


def test_d6_leaves_lots_far_apart_in_time_alone():
    lots = [
        lot("l1", "c1", "cat1", 3.0, "2026-09-02T10:00:00+05:30"),
        lot("l2", "c1", "cat1", 3.0, "2026-09-02T14:00:00+05:30"),
    ]
    flags, _ = d6_duplicate_lot(ctx(lots=lots), THRESHOLDS)
    assert flags == []


def test_d7_flags_impossible_travel():
    lots = [lot("l1", "c1", "cat1", 3.0, "2026-09-02T10:00:00+05:30", 19.0, 72.8)]
    handovers = [{"id": "h1", "lot_id": "l1", "recycler_id": "r1",
                  "handover_lat": 21.0, "handover_lng": 75.0,
                  "handover_ts": "2026-09-02T10:30:00+05:30", "status": "CONFIRMED"}]
    flags, _ = d7_impossible_travel(ctx(lots=lots, handovers=handovers), THRESHOLDS)
    assert len(flags) == 1
    assert flags[0].detail["implied_kmph"] > 80


def test_d8_flags_five_handovers_in_one_spot_within_a_minute():
    handovers = [
        {"id": f"h{i}", "lot_id": f"l{i}", "recycler_id": "r1",
         "handover_lat": 19.3919, "handover_lng": 72.8397,
         "handover_ts": f"2026-09-02T10:00:{i:02d}+05:30", "status": "CONFIRMED"}
        for i in range(6)
    ]
    flags, _ = d8_clustered_handovers(ctx(handovers=handovers), THRESHOLDS)
    assert len(flags) >= 1
    assert flags[0].detector_code == "D8"
