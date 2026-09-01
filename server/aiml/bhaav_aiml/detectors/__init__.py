"""The run loop. Collects flags, records which detectors ran and which skipped
with a reason. A detector that finds nothing but had enough data counts as
run; one that lacked data counts as skipped — that distinction is what keeps
the demo honest (AI.md section 11 rule 4).

Detectors are FAIL-SAFE: an exception inside a detector is caught, logged,
and treated as a skip — it must never crash /detect (AI-ANOMALY-SPEC section 1
rule 3). A detector service that fails must never block a collector's sale."""

from __future__ import annotations
import logging
from bhaav_aiml.models import Context, Flag, Skip
from bhaav_aiml.config import THRESHOLDS
from bhaav_aiml.detectors.price import (
    d1_price_deviation,
    d2_systematic_underpayment,
    d3_bait_pricing,
)
from bhaav_aiml.detectors.provenance import (
    d6_duplicate_lot,
    d7_impossible_travel,
    d8_clustered_handovers,
)
from bhaav_aiml.detectors.grading import (
    d9_grader_bias,
    d10_downgrade_change_point,
    d11_cross_category_uniformity,
    d12_offers_never_learn,
    d13_single_buyer_market,
)

log = logging.getLogger(__name__)

REGISTRY: dict[str, object] = {
    "D1": d1_price_deviation,
    "D2": d2_systematic_underpayment,
    "D3": d3_bait_pricing,
    "D6": d6_duplicate_lot,
    "D7": d7_impossible_travel,
    "D8": d8_clustered_handovers,
    "D9": d9_grader_bias,
    "D10": d10_downgrade_change_point,
    "D11": d11_cross_category_uniformity,
    "D12": d12_offers_never_learn,
    "D13": d13_single_buyer_market,
    # D4, D5 are out of scope (AI.md section 10): blocked on real per-category
    # weight distributions. They always skip with a reason.
}


def run_detectors(ctx: Context, thresholds=THRESHOLDS):
    """Run all in-scope detectors. Returns (flags, ran_codes, skipped_list).

    Fail-safe: any exception inside a detector is caught and reported as a skip;
    it never propagates to crash the /detect endpoint."""
    flags: list[Flag] = []
    ran: list[str] = []
    skipped: list[Skip] = []

    for code, fn in REGISTRY.items():
        try:
            found, skip = fn(ctx, thresholds)
            if skip is not None:
                skipped.append(skip)
            else:
                ran.append(code)
            flags.extend(found)
        except Exception as exc:  # noqa: BLE001
            log.exception("detector %s raised unexpectedly — treated as skip", code)
            skipped.append(Skip(code, f"detector error: {type(exc).__name__}"))

    # D4 and D5 are permanently out of scope — always skip with a reason.
    for code, reason in [
        ("D4", "out of scope: needs real per-category weight distributions (README open item 7)"),
        ("D5", "out of scope: needs real per-category value distributions (README open item 7)"),
    ]:
        skipped.append(Skip(code, reason))

    return flags, ran, skipped
