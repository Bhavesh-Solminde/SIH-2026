"""Measure the detector suite against labelled ground truth.

There is no real transaction history, so precision and recall are measured
against the seeded simulator's ground_truth rather than against reality. That is
a real limitation and it is stated in the report itself, not buried here — the
number this produces is "our detectors separate planted archetypes", not "our
detectors catch fraud in Maharashtra".

The baseline matters as much as the score. Flagging every recycler achieves
perfect recall and is worthless; a suite that cannot beat that on precision has
demonstrated nothing.
"""

from __future__ import annotations

from bhaav_aiml.config import THRESHOLDS, CONFIG_VERSION
from bhaav_aiml.detectors import run_detectors
from bhaav_aiml.models import Context
from bhaav_aiml.simulate import simulate

# honest_low_grade is deliberately NOT here. It has a downgrade rate as high as
# a liar's and is innocent by construction — flagging it is the exact false
# positive D9 exists to prevent, so it must count against precision.
GUILTY_PROFILES = ("systematic_liar", "late_onset_liar", "monopolist")


def _truth(body: dict) -> dict[str, str]:
    return {
        g["recycler_id"]: g["profile"]
        for g in body.get("ground_truth", [])
        if g.get("kind") == "recycler_profile"
    }


def evaluate(config: dict, thresholds: dict = THRESHOLDS) -> dict:
    """Run the suite over a simulated corpus and score it against ground truth."""
    body = simulate(config)
    ctx = Context.from_request(body)
    truth = _truth(body)

    # run_detectors returns THREE values — (flags, ran_codes, skipped) — see
    # server/aiml/bhaav_aiml/detectors/__init__.py.
    flags, ran, skipped = run_detectors(ctx, thresholds)

    guilty = {rid for rid, p in truth.items() if p in GUILTY_PROFILES}
    innocent = set(truth) - guilty

    # A recycler counts as accused only on a WARN or CRITICAL against them
    # directly. INFO is per-handover noise, and a MARKET finding names a
    # district rather than a person — neither is an accusation of a recycler.
    accused = {
        f.subject_id
        for f in flags
        if f.subject_type == "RECYCLER" and f.severity in ("WARN", "CRITICAL")
    }

    caught = sorted(guilty & accused)
    missed = sorted(guilty - accused)
    false_positives = sorted(innocent & accused)

    recall = len(caught) / len(guilty) if guilty else 0.0
    precision = len(caught) / len(accused) if accused else 0.0

    n_handovers = len(ctx.handovers)
    alert_rate = (len(flags) / n_handovers) if n_handovers else 0.0

    by_detector: dict[str, int] = {}
    for f in flags:
        by_detector[f.detector_code] = by_detector.get(f.detector_code, 0) + 1

    return {
        "recall": round(recall, 4),
        "precision": round(precision, 4),
        "alert_rate": round(alert_rate, 4),
        "within_budget": alert_rate <= thresholds["alert_budget"],
        "alert_budget": thresholds["alert_budget"],
        "caught": caught,
        "missed": missed,
        "false_positives": false_positives,
        "flags_by_detector": dict(sorted(by_detector.items())),
        "detectors_run": sorted(ran),
        # Skip's field is `code`, not `detector` — see models.py.
        "detectors_skipped": sorted({s.code: s.reason for s in skipped}.items()),
        "n_handovers": n_handovers,
        "n_guilty": len(guilty),
        "n_innocent": len(innocent),
        "config_version": CONFIG_VERSION,
        "simulated": True,
    }


def baseline_flag_everyone(body: dict) -> dict:
    """The null model: accuse every recycler. Perfect recall, useless precision.
    Any real result must beat this on precision or it has shown nothing.

    Takes the simulate() body rather than a Context, because Context carries only
    what a detector may read and ground_truth is deliberately not part of that.
    """
    truth = _truth(body)
    guilty = {rid for rid, p in truth.items() if p in GUILTY_PROFILES}
    everyone = set(truth)

    return {
        "recall": round(len(guilty & everyone) / len(guilty), 4) if guilty else 0.0,
        "precision": round(len(guilty & everyone) / len(everyone), 4) if everyone else 0.0,
        "alert_rate": 1.0,
        "simulated": True,
    }


def eval_report(result: dict) -> str:
    """Plain text for a terminal and for the deck. Every number carries its
    denominator, and the simulated label is not optional."""
    lines = [
        "DETECTOR EVALUATION — SIMULATED DATA, NOT REAL TRANSACTIONS",
        f"config_version : {result['config_version']}",
        f"handovers      : {result['n_handovers']}",
        f"recyclers      : {result['n_guilty']} planted bad actors, "
        f"{result['n_innocent']} innocent",
        "",
        f"recall         : {result['recall']}  "
        f"({len(result['caught'])}/{result['n_guilty']} bad actors caught)",
        f"precision      : {result['precision']}",
        f"alert rate     : {result['alert_rate']} against a budget of "
        f"{result['alert_budget']} — "
        f"{'WITHIN' if result['within_budget'] else 'OVER'} budget",
        "",
        f"caught         : {', '.join(result['caught']) or 'none'}",
        f"missed         : {', '.join(result['missed']) or 'none'}",
        f"false positives: {', '.join(result['false_positives']) or 'NONE'}",
        "",
        "flags by detector:",
    ]
    for code, n in result["flags_by_detector"].items():
        lines.append(f"  {code:<5} x{n}")
    if result["detectors_skipped"]:
        lines.append("")
        lines.append("skipped, with reasons:")
        for code, reason in result["detectors_skipped"]:
            lines.append(f"  {code:<5} {reason}")
    lines += [
        "",
        "Ground truth comes from the seeded simulator, not from reality. This",
        "measures separation of planted archetypes, not detection of real fraud.",
    ]
    return "\n".join(lines)


if __name__ == "__main__":  # pragma: no cover
    # `python -m bhaav_aiml.evaluate` — the adversarial run quoted in the deck.
    print(eval_report(evaluate({
        "seed": 42, "days": 200, "n_lots": 1200, "n_collectors": 30, "n_recyclers": 5,
        "recycler_profiles": {
            "systematic_liar": 1,
            "late_onset_liar": 1,
            "monopolist": 1,
            "honest_low_grade": 1,
            "honest": 1,
        },
    })))
