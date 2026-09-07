from bhaav_aiml.config import THRESHOLDS
from bhaav_aiml.evaluate import evaluate, baseline_flag_everyone, eval_report, GUILTY_PROFILES
from bhaav_aiml.simulate import simulate

ADVERSARIAL = {
    "seed": 42, "days": 200, "n_lots": 1200, "n_collectors": 30, "n_recyclers": 5,
    "recycler_profiles": {
        "systematic_liar": 1,
        "late_onset_liar": 1,
        "monopolist": 1,
        "honest_low_grade": 1,
        "honest": 1,
    },
}


def test_evaluate_catches_the_planted_bad_actors():
    result = evaluate(ADVERSARIAL, THRESHOLDS)
    assert result["recall"] >= 0.66, f"missed {result['missed']}"


def test_evaluate_does_not_flag_the_honest_low_grade_recycler():
    """The separation test. honest_low_grade is honest by construction and is
    the single false positive this whole design exists to avoid."""
    result = evaluate(ADVERSARIAL, THRESHOLDS)
    truth = {g["recycler_id"]: g["profile"]
             for g in simulate(ADVERSARIAL)["ground_truth"]
             if g["kind"] == "recycler_profile"}
    for rid in result["false_positives"]:
        assert truth.get(rid) != "honest_low_grade", "flagged the honest low-grade recycler"


def test_evaluate_reports_whether_it_is_inside_the_alert_budget():
    result = evaluate(ADVERSARIAL, THRESHOLDS)
    assert "alert_rate" in result
    assert result["within_budget"] == (result["alert_rate"] <= THRESHOLDS["alert_budget"])


def test_the_baseline_is_beaten():
    """Flagging everyone gets perfect recall and is useless. A detector suite
    that cannot beat it on precision has demonstrated nothing."""
    base = baseline_flag_everyone(simulate(ADVERSARIAL))
    result = evaluate(ADVERSARIAL, THRESHOLDS)
    assert base["recall"] == 1.0
    assert result["precision"] > base["precision"]


def test_evaluate_is_deterministic():
    assert evaluate(ADVERSARIAL, THRESHOLDS) == evaluate(ADVERSARIAL, THRESHOLDS)


def test_the_report_labels_its_data_simulated():
    """README ground rule 2 — simulated data is labelled simulated, every time."""
    text = eval_report(evaluate(ADVERSARIAL, THRESHOLDS))
    assert "SIMULATED" in text.upper()
    assert "recall" in text.lower()


def test_guilty_profiles_excludes_the_honest_low_grade_recycler():
    assert "honest_low_grade" not in GUILTY_PROFILES
    assert "honest" not in GUILTY_PROFILES
