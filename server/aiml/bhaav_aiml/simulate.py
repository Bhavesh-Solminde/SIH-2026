"""The only place randomness lives, and it is seeded. Everything it produces is
labelled simulated on screen and in the deck (AI.md section 8) — presenting
synthetic transactions as real is the fastest way to lose on integrity.

Recycler archetypes:
- honest           — baseline, low downgrade rate (~12%)
- honest_low_grade — genuinely receives poor material (high downgrade rate,
                     but concentrated on objectively poor collectors); publishes
                     a lower rate. Indistinguishable per-transaction from a liar;
                     separable only in aggregate via D9.
- systematic_liar  — uniform high downgrade rate on ALL collectors, including
                     those that others grade GOOD; keeps high published rate.
- late_onset_liar  — honest for the first half, then switches
- monopolist       — single buyer in their district; triggers D13
"""

from __future__ import annotations
import random
from datetime import datetime, timedelta

CATEGORIES = [
    {"id": "cat_pcb", "code": "PCB"},
    {"id": "cat_cable", "code": "CABLE"},
    {"id": "cat_battery", "code": "BATTERY"},
    {"id": "cat_motor", "code": "MOTOR"},
]
BASE_RATE = {"PCB": 190, "CABLE": 380, "BATTERY": 90, "MOTOR": 60}
GRADE_DOWN = {"GOOD": "POOR", "FAIR": "POOR"}


def _profiles(config: dict, rng: random.Random) -> list[str]:
    wanted = config.get("recycler_profiles", {})
    names: list[str] = []
    for profile, count in wanted.items():
        names.extend([profile] * count)
    n_recyclers = config.get("n_recyclers", 8)
    while len(names) < n_recyclers:
        names.append("honest")
    return names[:n_recyclers]


def simulate(config: dict) -> dict:
    """Generate seeded synthetic history.

    Required keys:
        seed        — int, for reproducibility
    Optional keys:
        n_collectors  (default 20)
        n_recyclers   (default 8)
        n_lots        (default 50)
        days          (default 45)
        recycler_profiles — dict[profile_name, count]; defaults to all honest
        inject        — ignored (reserved for explicit anomaly injection)

    Returns the same shape as a /detect request body, plus:
        ground_truth  — list of labelled truth records
        simulated     — True (always; never drop this label)
    """
    rng = random.Random(config["seed"])
    start = datetime.fromisoformat("2026-08-01T09:00:00+05:30")

    n_collectors = config.get("n_collectors", 20)
    n_lots = config.get("n_lots", 50)
    days = config.get("days", 45)

    profiles = _profiles(config, rng)
    recyclers = []
    ground_truth = []

    non_monopolist_count = sum(1 for p in profiles if p != "monopolist")

    for i, profile in enumerate(profiles):
        rid = f"r{i}"
        district = "Buldhana" if profile == "monopolist" else "Palghar"
        district_count = 1 if profile == "monopolist" else max(non_monopolist_count, 2)
        recyclers.append({
            "id": rid,
            "name": f"Recycler {i}",
            "lat": 19.4 + i * 0.01,
            "lng": 72.8 + i * 0.01,
            "district": district,
            "district_valid_recycler_count": district_count,
            "shared_identity_group": None,
        })
        ground_truth.append({
            "kind": "recycler_profile",
            "recycler_id": rid,
            "profile": profile,
        })

    # Rates: a dated series per recycler per category, not a single row.
    #
    # A single valid_from made three of eleven detectors unreachable on any
    # dataset: D3 (bait pricing) needs D3_min_history_days of span to see a
    # spike revert, D10 (downgrade change-point) needs D10_min_days of dated
    # history, and D12 (offers that never learn) needs a series to regress.
    # late_onset_liar existed purely to be caught by D10 and never could be.
    #
    # honest_low_grade publishes low from the start and drifts lower — they are
    # honest about the material. The liars cannot follow: publishing low loses
    # them the lot, and winning the lot is the entire point. That divergence is
    # exactly what D12 measures.
    reprice_every = config.get("reprice_every_days", 14)
    rates = []
    for r, profile in zip(recyclers, profiles):
        for cat in CATEGORIES:
            base = BASE_RATE[cat["code"]]
            for day in range(0, days, reprice_every):
                if profile == "honest_low_grade":
                    # Declares what they are, and keeps declaring it downward.
                    factor = 0.60 - 0.02 * (day / max(reprice_every, 1))
                elif profile in ("systematic_liar", "late_onset_liar", "monopolist"):
                    # Must stay high to keep winning lots; small jitter only.
                    factor = 1.00 + rng.uniform(-0.01, 0.01)
                else:
                    factor = 1.00 + rng.uniform(-0.05, 0.05)

                price = base * max(factor, 0.05)

                # D3's target: one recycler spikes to win the ranking, then
                # reverts within D3_revert_hours. Seeded, so it is reproducible.
                if profile == "systematic_liar" and day == reprice_every * 2:
                    price = base * 1.45

                rates.append({
                    "recycler_id": r["id"],
                    "category_id": cat["id"],
                    "unit": "KG",
                    "price": round(price, 2),
                    "valid_from": (start + timedelta(days=day)).isoformat(),
                })

    # Some collectors are "genuinely poor" — honest_low_grade concentrates on them.
    poor_collectors = {f"col{i}" for i in range(max(1, n_collectors // 3))}

    lots: list[dict] = []
    acceptances: list[dict] = []
    handovers: list[dict] = []

    # Build a per-pair series, newest last, so a lot can be priced at the rate
    # that was actually in force on its day rather than at whichever row the
    # dict happened to keep.
    rate_series: dict[tuple[str, str], list[dict]] = {}
    for x in rates:
        rate_series.setdefault((x["recycler_id"], x["category_id"]), []).append(x)
    for rows in rate_series.values():
        rows.sort(key=lambda x: x["valid_from"])

    def rate_on(recycler_id: str, category_id: str, when: datetime) -> float:
        rows = rate_series[(recycler_id, category_id)]
        in_force = [x for x in rows if datetime.fromisoformat(x["valid_from"]) <= when]
        return (in_force[-1] if in_force else rows[0])["price"]

    def _downgrade_rate(profile: str, day: int) -> float:
        return {
            "honest": 0.12,
            "honest_low_grade": 0.85,   # high but concentrated on genuinely poor collectors
            "systematic_liar": 0.90,    # uniform across ALL collectors
            "late_onset_liar": 0.12 if day < days // 2 else 0.85,
            "monopolist": 0.85,
        }[profile]

    for n in range(n_lots):
        collector = f"col{rng.randrange(n_collectors)}"
        cat = rng.choice(CATEGORIES)
        r = rng.choice(recyclers)
        profile = profiles[int(r["id"][1:])]
        day = rng.randrange(days)
        ts = start + timedelta(days=day, minutes=rng.randrange(600))
        declared = "GOOD"

        lot_id = f"l{n}"
        qty = round(rng.uniform(1, 10), 3)
        lots.append({
            "id": lot_id,
            "collector_id": collector,
            "category_id": cat["id"],
            "unit": "KG",
            "quantity": qty,
            "condition": declared,
            "collection_lat": 19.39,
            "collection_lng": 72.83,
            "collection_ts": ts.isoformat(),
        })

        published = rate_on(r["id"], cat["id"], ts)
        acceptances.append({
            "id": f"a{n}",
            "lot_id": lot_id,
            "recycler_id": r["id"],
            "accepted_rate": published,
            "accepted_unit": "KG",
        })

        # Decide the inspected grade by recycler archetype.
        rate = _downgrade_rate(profile, day)
        if profile == "honest_low_grade":
            # honest_low_grade: only downgrades genuinely poor collectors,
            # and almost never touches good-collector material.
            downgrades = collector in poor_collectors and rng.random() < 0.95
        else:
            downgrades = rng.random() < rate

        inspected = GRADE_DOWN.get(declared, declared) if downgrades else declared
        # Liar: keeps published price even when downgrading (the give-away).
        # honest_low_grade: pays proportionally less (honest about the material).
        final = published * (0.4 if downgrades else 1.0)

        handovers.append({
            "id": f"h{n}",
            "lot_id": lot_id,
            "recycler_id": r["id"],
            "inspected_quantity": qty,
            "final_unit_price": round(final, 2),
            "final_total": round(final * qty, 2),
            "inspected_condition": inspected,
            "downgrade_reason_code": "POOR_CONDITION" if downgrades else None,
            "handover_lat": 19.41,
            "handover_lng": 72.80,
            "handover_ts": (ts + timedelta(hours=2)).isoformat(),
            "status": "CONFIRMED",
        })

    return {
        "as_of": (start + timedelta(days=days)).isoformat(),
        "categories": CATEGORIES,
        "recyclers": recyclers,
        "rates": rates,
        "lots": lots,
        "acceptances": acceptances,
        "handovers": handovers,
        "ground_truth": ground_truth,
        "simulated": True,  # never drop this label
    }
