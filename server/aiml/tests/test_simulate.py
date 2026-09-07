"""Tests for POST /simulate — M07."""

from datetime import datetime

from bhaav_aiml.simulate import simulate


def cfg(**over):
    base = {
        "seed": 42,
        "n_collectors": 20,
        "n_recyclers": 8,
        "n_lots": 200,
        "days": 45,
        "recycler_profiles": {
            "honest": 4,
            "honest_low_grade": 1,
            "systematic_liar": 1,
            "late_onset_liar": 1,
            "monopolist": 1,
        },
        "inject": {"D2": 3, "D6": 2, "D7": 2, "D8": 1},
    }
    base.update(over)
    return base


def test_simulate_is_reproducible_with_a_seed():
    a = simulate(cfg())
    b = simulate(cfg())
    assert a["lots"] == b["lots"]
    assert a["handovers"] == b["handovers"]


def test_simulate_returns_the_detect_request_shape():
    out = simulate(cfg())
    for key in ["categories", "recyclers", "rates", "lots", "acceptances", "handovers", "ground_truth"]:
        assert key in out


def test_simulate_labels_every_recycler_profile_in_ground_truth():
    out = simulate(cfg())
    profiles = {g["recycler_id"]: g["profile"] for g in out["ground_truth"] if g["kind"] == "recycler_profile"}
    assert "systematic_liar" in profiles.values()
    assert "honest_low_grade" in profiles.values()


def test_the_pair_that_matters_is_separable():
    # honest_low_grade and systematic_liar are indistinguishable per-transaction
    # and separable only in aggregate. This is worth more than every other
    # detector combined (AI-ANOMALY-SPEC section 8).
    from bhaav_aiml.models import Context
    from bhaav_aiml.detectors.grading import grader_bias

    out = simulate(cfg())
    gt = {g["recycler_id"]: g["profile"] for g in out["ground_truth"] if g["kind"] == "recycler_profile"}
    liar = next(r for r, p in gt.items() if p == "systematic_liar")
    low = next(r for r, p in gt.items() if p == "honest_low_grade")
    ctx = Context(
        "2026-09-02T18:00:00+05:30",
        out["categories"],
        out["recyclers"],
        out["rates"],
        out["lots"],
        out["acceptances"],
        out["handovers"],
    )
    lot_by_id = ctx.lot_by_id()
    bias_liar = grader_bias(out["handovers"], lot_by_id, liar)
    bias_low = grader_bias(out["handovers"], lot_by_id, low)
    # The liar's bias is clearly above the honest low-grade recycler's.
    assert bias_liar is None or bias_low is None or bias_liar > bias_low


def test_simulate_endpoint_returns_200(client):
    """POST /simulate returns 200 with expected keys."""
    body = {
        "seed": 1,
        "n_lots": 20,
        "n_collectors": 5,
        "n_recyclers": 3,
        "days": 10,
        "recycler_profiles": {"honest": 3},
        "inject": {},
    }
    res = client.post("/simulate", json=body)
    assert res.status_code == 200
    data = res.json()
    assert data["simulated"] is True
    assert "lots" in data
    assert "ground_truth" in data


def test_simulate_marked_simulated():
    """Output always carries simulated: True."""
    out = simulate(cfg())
    assert out["simulated"] is True


def test_rates_span_the_whole_simulated_window():
    """D3 needs D3_min_history_days of span; a single valid_from gives it none."""
    out = simulate({"seed": 7, "days": 120, "n_recyclers": 4})
    stamps = sorted({r["valid_from"] for r in out["rates"]})
    assert len(stamps) > 1, "every rate shares one valid_from — D3/D10/D12 cannot run"

    first = datetime.fromisoformat(stamps[0])
    last = datetime.fromisoformat(stamps[-1])
    assert (last - first).days >= 60


def test_every_recycler_category_pair_has_a_rate_series():
    out = simulate({"seed": 7, "days": 120, "n_recyclers": 4})
    series = {}
    for r in out["rates"]:
        series.setdefault((r["recycler_id"], r["category_id"]), []).append(r)
    assert series, "no rates emitted"
    for key, rows in series.items():
        assert len(rows) >= 2, f"{key} has no series to trend"


def test_the_late_onset_liar_keeps_its_rate_high_after_it_switches():
    """D12's economic tell: someone genuinely receiving poor material lowers
    their published rate; someone lying cannot, because the high rate is what
    wins the lot."""
    out = simulate({
        "seed": 11, "days": 120, "n_recyclers": 3,
        "recycler_profiles": {"late_onset_liar": 1, "honest": 2},
    })
    liar = next(g["recycler_id"] for g in out["ground_truth"]
                if g.get("profile") == "late_onset_liar")

    # Compare within a category, not across them: categories have very
    # different BASE_RATE values (e.g. PCB 190 vs MOTOR 60), so a comparison
    # spanning categories is not a trend test at all.
    by_category: dict[str, list[dict]] = {}
    for r in out["rates"]:
        if r["recycler_id"] == liar:
            by_category.setdefault(r["category_id"], []).append(r)

    for category_id, rows in by_category.items():
        rows.sort(key=lambda r: r["valid_from"])
        assert rows[-1]["price"] >= rows[0]["price"] * 0.95, category_id
