"""Thresholds are configuration, not code (AI.md section 5 rule 4). They will
be wrong at first and must be tunable without a release. CONFIG_VERSION is
recorded on every flag so no past decision is ever inexplicable
(AI-ANOMALY-SPEC gap 9)."""

CONFIG_VERSION = "thresholds-v1"

THRESHOLDS = {
    # D1 price deviation — INFO only; a single post-inspection negotiation can
    # exceed this, so it never rises above INFO on its own.
    "D1_deviation": 0.25,
    # D2 systematic underpayment — the strongest detector.
    "D2_ratio": 0.85,
    "D2_min_handovers": 10,
    # D3 bait pricing.
    "D3_change": 0.30,
    "D3_revert_hours": 72,
    "D3_min_history_days": 7,
    # D6 duplicate lot.
    "D6_quantity_tolerance": 0.02,
    "D6_window_minutes": 15,
    # D7 impossible travel.
    "D7_kmph": 80.0,
    # D8 clustered handovers.
    "D8_count": 5,
    "D8_window_seconds": 60,
    "D8_radius_m": 10.0,
    # D9 grader bias.
    "D9_bias_warn": 0.35,
    "D9_bias_critical": 0.60,
    "D9_min_shared_collectors": 10,
    "D9_critical_min_n": 20,
    # D10 downgrade change-point. A recycler at a low downgrade rate for months
    # that jumps did not experience a change in material — it experienced a
    # change in policy. `step` is the absolute rise in downgrade RATE (0..1)
    # between the preceding and trailing windows, not a multiplier.
    "D10_step": 0.30,
    "D10_min_days": 60,
    "D10_min_handovers": 20,
    "D10_min_per_window": 8,
    # D11 cross-category downgrade uniformity.
    "D11_min_categories": 3,
    "D11_min_per_category": 10,
    "D11_variance_max": 0.02,
    "D11_mean_min": 0.60,
    # D12 offers that never learn. `flat_drop_min` is the mean shortfall of paid
    # against published (1 - paid/published) that counts as a persistent gap;
    # `rate_fall_max` is how far a recycler's OWN published rate may fall across
    # the window before they count as having learned — falling further is the
    # honest declaration D12 must not punish.
    "D12_min_handovers": 15,
    "D12_min_days": 30,
    "D12_flat_drop_min": 0.20,
    "D12_rate_fall_max": 0.15,
    # D13 single-buyer market.
    "D13_downgrade_rate": 0.60,
    "D13_min_handovers": 20,
    # Alert budget — precision over recall (AI-ANOMALY-SPEC gap 5).
    "alert_budget": 0.05,
}

IN_SCOPE = ["D1", "D2", "D3", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"]
