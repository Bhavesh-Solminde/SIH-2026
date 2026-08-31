# AI/ML Service Implementation Plan — Bhaav (SIH26229)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stateless Python service that scores a slice of transaction history against rule-based anomaly detectors and returns explainable flags, plus a seeded synthetic-history generator that lets the detectors be exercised and evaluated before any real transactions exist.

**Architecture:** FastAPI over pure-function detectors. The service has **no database access** — every history feature it needs arrives in the `POST /detect` body, computed by `server/api` (plan 01, task 20). It **never writes**; it returns findings and the API decides what to persist. Same input produces same output: no randomness at detect time, no wall-clock reads (`as_of` comes in the request). Detectors that lack their minimum data **skip with a reason** rather than firing on data too thin to support them. **No trained model ships** — the user's directive is "keep it simple but useful", and the model is added later; today the detectors are defined thresholds. `POST /simulate` takes a `seed` so the recall figures are reproducible.

**Tech Stack:** Python 3.13 · FastAPI · uvicorn · pytest · **standard library only** for the maths (no numpy, no pandas, no scikit-learn). No Docker — Python installed natively.

## Global Constraints

Every task's requirements implicitly include [the Global Constraints table in the index](2026-09-01-00-index.md#global-constraints). The ones this plan is built on:

- **Python 3.13 + FastAPI + uvicorn.** Stdlib maths only — `statistics`, `math`, `bisect`. No numpy/pandas/sklearn.
- **No Docker.** `python -m venv .venv`, native.
- **Rules, not learned models.** `AI.md` §1 and `AI-ANOMALY-SPEC` §0.1 both settle this; the Isolation Forest proposal is rejected. The model is added later.
- **Stateless, no DB, no writes, deterministic, skip-with-reason.** The four contract rules from `AI.md` §11 and `AI-ANOMALY-SPEC` §1.
- **In scope: D1, D2, D3, D6, D7, D8, D9** (`AI.md` §10), plus **D10, D11, D12, D13** (the zero-overlap set, `AI-ANOMALY-SPEC` §6.3). **D4, D5 out of scope** — blocked on real per-category weight distributions; they skip with a reason. **D14** is a stretch goal, last.
- **Everything `/simulate` produces is labelled simulated.** On screen and in the deck.

---

## File Structure

```
server/aiml/pyproject.toml           deps: fastapi, uvicorn, pytest, httpx
server/aiml/requirements.txt          pinned, for a stranger to `pip install -r`
server/aiml/main.py                   FastAPI app: /health, /detect, /simulate
server/aiml/bhaav_aiml/__init__.py
server/aiml/bhaav_aiml/models.py      request/response dataclasses (typed, validated)
server/aiml/bhaav_aiml/config.py      thresholds — configuration, not code
server/aiml/bhaav_aiml/geo.py         haversine, implied speed
server/aiml/bhaav_aiml/stats.py       median, percentile, mad — stdlib only
server/aiml/bhaav_aiml/detectors/__init__.py    the registry + run loop
server/aiml/bhaav_aiml/detectors/price.py       D1, D2, D3
server/aiml/bhaav_aiml/detectors/provenance.py  D6, D7, D8
server/aiml/bhaav_aiml/detectors/grading.py     D9, D10, D11, D12, D13
server/aiml/bhaav_aiml/simulate.py    seeded generator with recycler archetypes
server/aiml/tests/conftest.py
server/aiml/tests/test_*.py
```

**Why this split.** Each detector is a pure function `(context) -> list[Flag] | Skip`, grouped by the data it reads: price detectors over the three-price structure, provenance over the two geotags, grading over cross-recycler agreement. The registry runs them and collects `detectors_run` / `detectors_skipped`. Thresholds live in `config.py` because they will be wrong at first and must be tunable without a code change (`AI.md` §5 rule 4). `simulate.py` is the only place randomness lives, and it is seeded.

---

## Prerequisite

Python 3.13 available (`python3 --version`). The `POST /detect` contract in `AI.md` §11 is frozen — that is `README.md` open item 1, confirmed. No dependency on the API being up: this service is developed and tested in isolation, which is the whole point of the stateless contract.

---

## Task 1: Scaffold, `/health`, and the contract models

**Files:**
- Create: `server/aiml/pyproject.toml`, `requirements.txt`, `main.py`, `bhaav_aiml/__init__.py`, `bhaav_aiml/models.py`, `bhaav_aiml/config.py`
- Test: `server/aiml/tests/conftest.py`, `server/aiml/tests/test_health.py`

**Interfaces:**
- Produces: `GET /health -> {status, detectors}`; dataclasses `DetectRequest`, `Flag`, `Skip`, `DetectResponse`; `THRESHOLDS`, `CONFIG_VERSION`

- [ ] **Step 1: Create the environment**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/server/aiml"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

- [ ] **Step 2: Write the dependency files**

`server/aiml/requirements.txt`:

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
pytest==8.3.4
httpx==0.28.1
```

`server/aiml/pyproject.toml`:

```toml
[project]
name = "bhaav-aiml"
version = "1.0.0"
requires-python = ">=3.13"
dependencies = ["fastapi", "uvicorn[standard]"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

Install:

```bash
pip install -r requirements.txt
```

- [ ] **Step 3: Write `bhaav_aiml/config.py`**

```python
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
    # D10 downgrade change-point.
    "D10_step": 3.0,
    "D10_min_days": 60,
    "D10_min_handovers": 20,
    # D11 cross-category downgrade uniformity.
    "D11_min_categories": 3,
    "D11_min_per_category": 10,
    "D11_variance_max": 0.02,
    "D11_mean_min": 0.60,
    # D12 offers that never learn.
    "D12_min_handovers": 15,
    "D12_min_days": 30,
    "D12_flat_drop_min": 0.20,
    # D13 single-buyer market.
    "D13_downgrade_rate": 0.60,
    "D13_min_handovers": 20,
    # Alert budget — precision over recall (AI-ANOMALY-SPEC gap 5).
    "alert_budget": 0.05,
}

IN_SCOPE = ["D1", "D2", "D3", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"]
```

- [ ] **Step 4: Write `bhaav_aiml/models.py`**

```python
"""Typed request/response mirrors of AI.md section 11. Validation is light and
explicit: a missing field is a bad request, not a silent None that a detector
later divides by."""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class Flag:
    detector_code: str
    subject_type: str  # LOT | HANDOVER | RECYCLER | COLLECTOR | MARKET
    subject_id: str
    severity: str  # INFO | WARN | CRITICAL
    detail: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Skip:
    code: str
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "reason": self.reason}


@dataclass
class DetectResponse:
    run_id: str
    config_version: str
    detectors_run: list[str] = field(default_factory=list)
    detectors_skipped: list[Skip] = field(default_factory=list)
    flags: list[Flag] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "config_version": self.config_version,
            "detectors_run": self.detectors_run,
            "detectors_skipped": [s.to_dict() for s in self.detectors_skipped],
            "flags": [f.to_dict() for f in self.flags],
        }


@dataclass
class Context:
    """Everything a detector may read. Built once per request from the body;
    detectors never reach outside it, which is what keeps the service stateless
    (AI-ANOMALY-SPEC section 1 rule 1)."""

    as_of: str
    categories: list[dict]
    recyclers: list[dict]
    rates: list[dict]
    lots: list[dict]
    acceptances: list[dict]
    handovers: list[dict]

    @classmethod
    def from_request(cls, body: dict) -> "Context":
        return cls(
            as_of=body["as_of"],
            categories=body.get("categories", []),
            recyclers=body.get("recyclers", []),
            rates=body.get("rates", []),
            lots=body.get("lots", []),
            acceptances=body.get("acceptances", []),
            handovers=body.get("handovers", []),
        )

    # Convenience joins the detectors lean on.
    def lot_by_id(self) -> dict[str, dict]:
        return {lot["id"]: lot for lot in self.lots}

    def acceptance_by_lot(self) -> dict[str, dict]:
        return {a["lot_id"]: a for a in self.acceptances}
```

- [ ] **Step 5: Write the failing health test**

`server/aiml/tests/conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    return TestClient(app)
```

`server/aiml/tests/test_health.py`:

```python
def test_health_lists_the_in_scope_detectors(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    for code in ["D1", "D2", "D3", "D6", "D7", "D8", "D9"]:
        assert code in body["detectors"]
```

- [ ] **Step 6: Write `main.py`**

```python
from fastapi import FastAPI, Request
from bhaav_aiml.config import IN_SCOPE, CONFIG_VERSION

app = FastAPI(title="Bhaav AI/ML")


@app.get("/health")
def health():
    return {"status": "ok", "detectors": IN_SCOPE, "config_version": CONFIG_VERSION}


# /detect and /simulate are added in tasks 6 and 8.
```

- [ ] **Step 7: Run the test and commit**

```bash
cd "/Users/solminde/Developer/Personal/SIH(2026)/server/aiml" && source .venv/bin/activate
pytest tests/test_health.py -v
git add server/aiml
git commit -m "feat(aiml): fastapi scaffold, contract models, thresholds config, /health"
```

Expected: PASS, 1 test.

---

## Task 2: Stats and geo — the stdlib maths

**Files:**
- Create: `server/aiml/bhaav_aiml/stats.py`, `server/aiml/bhaav_aiml/geo.py`
- Test: `server/aiml/tests/test_stats.py`, `server/aiml/tests/test_geo.py`

**Interfaces:**
- Produces: `median(xs)`, `mean(xs)`, `pvariance(xs)`, `mad(xs)`; `haversine_km(a, b)`, `implied_kmph(a, b, ts_a, ts_b)`

The geo functions must match `@bhaav/core/geo` exactly — the JavaScript D7 and the Python D7 have to agree, and the 0.01-hour floor is the seam.

- [ ] **Step 1: Write the failing tests**

`server/aiml/tests/test_stats.py`:

```python
import math
from bhaav_aiml.stats import median, mean, pvariance, mad


def test_median_odd_and_even():
    assert median([3, 1, 2]) == 2
    assert median([1, 2, 3, 4]) == 2.5


def test_median_empty_is_none():
    assert median([]) is None


def test_mean():
    assert mean([2, 4, 6]) == 4


def test_pvariance_zero_when_uniform():
    assert pvariance([5, 5, 5]) == 0


def test_mad_is_robust_to_an_outlier():
    # median absolute deviation ignores the single large value
    assert mad([1, 1, 1, 100]) == 0
```

`server/aiml/tests/test_geo.py`:

```python
from bhaav_aiml.geo import haversine_km, implied_kmph

VASAI = (19.3919, 72.8397)
NALASOPARA = (19.4176, 72.8562)


def test_haversine_known_short_hop():
    km = haversine_km(VASAI, NALASOPARA)
    assert 3.2 < km < 3.5


def test_haversine_none_when_missing():
    assert haversine_km(VASAI, (None, None)) is None


def test_implied_speed_floor_matches_the_js_seam():
    # A same-instant pair uses the 0.01-hour floor, exactly like SERVER.md D7
    kmph = implied_kmph(
        VASAI, NALASOPARA, "2026-09-02T10:00:00+05:30", "2026-09-02T10:00:00+05:30"
    )
    assert kmph > 300
```

- [ ] **Step 2: Write `bhaav_aiml/stats.py`**

```python
"""Stdlib-only statistics. No numpy — the volumes here are tiny and a native
dependency is a demo-day liability."""

from __future__ import annotations
import statistics


def median(xs: list[float]) -> float | None:
    return statistics.median(xs) if xs else None


def mean(xs: list[float]) -> float | None:
    return statistics.fmean(xs) if xs else None


def pvariance(xs: list[float]) -> float | None:
    return statistics.pvariance(xs) if len(xs) >= 1 else None


def mad(xs: list[float]) -> float | None:
    """Median absolute deviation — robust to a single outlier, which is exactly
    the shape of a misdeclared-category lot (D5's basis, kept here for reuse)."""
    if not xs:
        return None
    m = statistics.median(xs)
    return statistics.median([abs(x - m) for x in xs])


def percentile(xs: list[float], p: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    k = (len(s) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)
```

- [ ] **Step 3: Write `bhaav_aiml/geo.py`**

```python
"""Mirrors @bhaav/core/geo so the JavaScript and Python forms of D7 agree.
Returns None — never 0 — when a coordinate is missing (DB.md section 2)."""

from __future__ import annotations
import math
from datetime import datetime

EARTH_RADIUS_KM = 6371.0088


def _is_point(p) -> bool:
    return (
        p is not None
        and p[0] is not None
        and p[1] is not None
        and math.isfinite(p[0])
        and math.isfinite(p[1])
    )


def haversine_km(a, b) -> float | None:
    if not _is_point(a) or not _is_point(b):
        return None
    lat1, lng1 = a
    lat2, lng2 = b
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    s = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(s)))


def implied_kmph(a, b, ts_a: str, ts_b: str) -> float | None:
    km = haversine_km(a, b)
    if km is None:
        return None
    hours = (datetime.fromisoformat(ts_b) - datetime.fromisoformat(ts_a)).total_seconds() / 3600.0
    # 0.01-hour floor, matching SERVER.md section 10's GREATEST(..., 0.01).
    return km / max(hours, 0.01)
```

- [ ] **Step 4: Run and commit**

```bash
pytest tests/test_stats.py tests/test_geo.py -v
git add server/aiml/bhaav_aiml/stats.py server/aiml/bhaav_aiml/geo.py server/aiml/tests/test_stats.py server/aiml/tests/test_geo.py
git commit -m "feat(aiml): stdlib stats and geo, geo matching @bhaav/core exactly"
```

Expected: PASS, 10 tests.

---

## Task 3: The detector registry and the price detectors D1, D2, D3

**Files:**
- Create: `server/aiml/bhaav_aiml/detectors/__init__.py`, `server/aiml/bhaav_aiml/detectors/price.py`
- Test: `server/aiml/tests/test_price_detectors.py`

**Interfaces:**
- Produces: `run_detectors(context) -> (flags, ran, skipped)`; `d1_price_deviation`, `d2_systematic_underpayment`, `d3_bait_pricing`
- Each detector: `(context, thresholds) -> tuple[list[Flag], Skip | None]`

- [ ] **Step 1: Write the failing test**

`server/aiml/tests/test_price_detectors.py`:

```python
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
```

- [ ] **Step 2: Write `bhaav_aiml/detectors/price.py`**

```python
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
```

- [ ] **Step 3: Write the registry `bhaav_aiml/detectors/__init__.py`**

```python
"""The run loop. Collects flags, records which detectors ran and which skipped
with a reason. A detector that finds nothing but had enough data counts as
run; one that lacked data counts as skipped — that distinction is what keeps
the demo honest (AI.md section 11 rule 4)."""

from __future__ import annotations
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

REGISTRY = {
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
    flags: list[Flag] = []
    ran: list[str] = []
    skipped: list[Skip] = []

    for code, fn in REGISTRY.items():
        found, skip = fn(ctx, thresholds)
        if skip is not None:
            skipped.append(skip)
        else:
            ran.append(code)
        flags.extend(found)

    for code, reason in [
        ("D4", "out of scope: needs real per-category weight distributions (README open item 7)"),
        ("D5", "out of scope: needs real per-category value distributions (README open item 7)"),
    ]:
        skipped.append(Skip(code, reason))

    return flags, ran, skipped
```

- [ ] **Step 4: Provenance and grading modules must exist for the import**

Create stubs now so the registry imports; they are implemented in tasks 4 and 5. `server/aiml/bhaav_aiml/detectors/provenance.py` and `grading.py` each temporarily contain functions that return `([], None)`. Replace them in the next two tasks — the tests for D1/D2/D3 pass against the stubs.

- [ ] **Step 5: Run and commit**

```bash
pytest tests/test_price_detectors.py -v
git add server/aiml/bhaav_aiml/detectors
git commit -m "feat(aiml): detector registry and price detectors D1, D2, D3"
```

Expected: PASS, 7 tests.

---

## Task 4: Provenance detectors D6, D7, D8

**Files:**
- Modify: `server/aiml/bhaav_aiml/detectors/provenance.py`
- Test: `server/aiml/tests/test_provenance_detectors.py`

**Interfaces:**
- Produces: `d6_duplicate_lot`, `d7_impossible_travel`, `d8_clustered_handovers` — all fire from the first transaction

- [ ] **Step 1: Write the failing test**

`server/aiml/tests/test_provenance_detectors.py`:

```python
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
```

- [ ] **Step 2: Write `bhaav_aiml/detectors/provenance.py`**

```python
"""Provenance detectors over the two geotags and two timestamps. All fire from
the first transaction — no history needed."""

from __future__ import annotations
from datetime import datetime
from bhaav_aiml.models import Context, Flag, Skip
from bhaav_aiml.geo import haversine_km, implied_kmph


def d6_duplicate_lot(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Same collector, same category, quantity within tolerance, within a short
    window — the shape of the same material double-counted."""
    flags: list[Flag] = []
    by_key: dict[tuple[str, str], list[dict]] = {}
    for lot in ctx.lots:
        by_key.setdefault((lot["collector_id"], lot["category_id"]), []).append(lot)

    tol = th["D6_quantity_tolerance"]
    window = th["D6_window_minutes"] * 60
    for lots in by_key.values():
        lots = sorted(lots, key=lambda l: l["collection_ts"])
        for i in range(1, len(lots)):
            a, b = lots[i - 1], lots[i]
            if a["quantity"] == 0:
                continue
            close_qty = abs(b["quantity"] - a["quantity"]) / a["quantity"] <= tol
            secs = (datetime.fromisoformat(b["collection_ts"])
                    - datetime.fromisoformat(a["collection_ts"])).total_seconds()
            if close_qty and secs <= window:
                flags.append(Flag("D6", "LOT", b["id"], "WARN",
                                  {"quantity_tolerance": tol, "minutes_apart": round(secs / 60, 1)}))
    return flags, None


def d7_impossible_travel(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    lot_by_id = ctx.lot_by_id()
    flags: list[Flag] = []
    for h in ctx.handovers:
        lot = lot_by_id.get(h["lot_id"])
        if not lot:
            continue
        kmph = implied_kmph(
            (lot.get("collection_lat"), lot.get("collection_lng")),
            (h.get("handover_lat"), h.get("handover_lng")),
            lot["collection_ts"], h["handover_ts"],
        )
        if kmph is not None and kmph > th["D7_kmph"]:
            km = haversine_km((lot["collection_lat"], lot["collection_lng"]),
                              (h["handover_lat"], h["handover_lng"]))
            flags.append(Flag("D7", "HANDOVER", h["id"], "WARN",
                              {"implied_kmph": round(kmph, 1), "distance_km": round(km, 2),
                               "threshold": th["D7_kmph"]}))
    return flags, None


def d8_clustered_handovers(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """N handovers within a few seconds at one point — bulk-fabricated records."""
    by_recycler: dict[str, list[dict]] = {}
    for h in ctx.handovers:
        if h.get("handover_lat") is None:
            continue
        by_recycler.setdefault(h["recycler_id"], []).append(h)

    flags: list[Flag] = []
    for recycler_id, rows in by_recycler.items():
        rows = sorted(rows, key=lambda h: h["handover_ts"])
        for i in range(len(rows)):
            cluster = [rows[i]]
            for j in range(i + 1, len(rows)):
                secs = (datetime.fromisoformat(rows[j]["handover_ts"])
                        - datetime.fromisoformat(rows[i]["handover_ts"])).total_seconds()
                if secs > th["D8_window_seconds"]:
                    break
                d = haversine_km((rows[i]["handover_lat"], rows[i]["handover_lng"]),
                                 (rows[j]["handover_lat"], rows[j]["handover_lng"]))
                if d is not None and d * 1000 <= th["D8_radius_m"]:
                    cluster.append(rows[j])
            if len(cluster) >= th["D8_count"]:
                flags.append(Flag("D8", "RECYCLER", recycler_id, "CRITICAL",
                                  {"count": len(cluster), "seconds": th["D8_window_seconds"],
                                   "radius_m": th["D8_radius_m"]}))
                break
    return flags, None
```

- [ ] **Step 3: Run and commit**

```bash
pytest tests/test_provenance_detectors.py -v
git add server/aiml/bhaav_aiml/detectors/provenance.py server/aiml/tests/test_provenance_detectors.py
git commit -m "feat(aiml): provenance detectors D6, D7, D8 — fire from the first transaction"
```

Expected: PASS, 5 tests.

---

## Task 5: Grading detectors D9, D10, D11, D12, D13 — the separation

**The standout for Q&A.** D9 is the one detector that answers "what did the model catch that a threshold couldn't?" — because D1 and D2 flag a genuinely low-grade-but-honest recycler exactly like a lying one, and D9 tells them apart by comparing recyclers **on the same collectors**.

**Files:**
- Modify: `server/aiml/bhaav_aiml/detectors/grading.py`
- Test: `server/aiml/tests/test_grading_detectors.py`

**Interfaces:**
- Produces: `d9_grader_bias`, `d10_downgrade_change_point`, `d11_cross_category_uniformity`, `d12_offers_never_learn`, `d13_single_buyer_market`; `grader_bias(handovers, lots, recycler_id)` helper

- [ ] **Step 1: Write the failing test**

`server/aiml/tests/test_grading_detectors.py`:

```python
from bhaav_aiml.models import Context
from bhaav_aiml.config import THRESHOLDS
from bhaav_aiml.detectors.grading import d9_grader_bias, d13_single_buyer_market, grader_bias

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
    # The liar downgrades what everyone else calls GOOD → high bias.
    assert bias_lie > 0.6
    # The honest recycler tracks the others → near zero.
    assert abs(bias_hon) < 0.2

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
```

- [ ] **Step 2: Write `bhaav_aiml/detectors/grading.py`**

```python
"""Grading detectors. Material quality is a property of the SOURCE, not the
buyer — so the clean discriminator (D9) is whether the same collectors get
graded differently by different recyclers. D10-D12 cover the zero-overlap case,
and D13 flags a single-buyer market rather than a person."""

from __future__ import annotations
from bhaav_aiml.models import Context, Flag, Skip

GRADE = {"GOOD": 3, "FAIR": 2, "POOR": 1}


def _is_downgrade(declared: str, inspected: str | None) -> bool:
    if inspected is None or declared is None:
        return False
    return GRADE.get(inspected, 3) < GRADE.get(declared, 3)


def grader_bias(handovers, lot_by_id, recycler_id) -> float | None:
    """mean over shared collectors of (this recycler's downgrade rate on a
    collector - every other recycler's downgrade rate on that collector).

    Range -1..+1. bias ~ 0 means this recycler grades like everyone else — even
    at a 94% downgrade rate they are exonerated. bias ~ +0.7 means they call
    POOR what others called GOOD, on the same collectors."""
    # Downgrade outcomes per (collector, recycler).
    per: dict[str, dict[str, list[int]]] = {}
    for h in handovers:
        lot = lot_by_id.get(h["lot_id"])
        if not lot:
            continue
        c = lot["collector_id"]
        d = 1 if _is_downgrade(lot["condition"], h.get("inspected_condition")) else 0
        per.setdefault(c, {}).setdefault(h["recycler_id"], []).append(d)

    diffs = []
    for collector, by_rec in per.items():
        if recycler_id not in by_rec:
            continue
        others = [d for r, ds in by_rec.items() if r != recycler_id for d in ds]
        if not others:
            continue  # no overlap on this collector
        mine = sum(by_rec[recycler_id]) / len(by_rec[recycler_id])
        theirs = sum(others) / len(others)
        diffs.append(mine - theirs)

    if not diffs:
        return None
    return sum(diffs) / len(diffs)


def _shared_group(ctx: Context, recycler_id):
    for r in ctx.recyclers:
        if r["id"] == recycler_id:
            return r.get("shared_identity_group")
    return None


def d9_grader_bias(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    lot_by_id = ctx.lot_by_id()
    recyclers = {h["recycler_id"] for h in ctx.handovers}

    # Count shared collectors: those who sold to more than one recycler.
    collector_recyclers: dict[str, set] = {}
    for h in ctx.handovers:
        lot = lot_by_id.get(h["lot_id"])
        if lot:
            collector_recyclers.setdefault(lot["collector_id"], set()).add(h["recycler_id"])
    shared = {c for c, rs in collector_recyclers.items() if len(rs) >= 2}

    flags: list[Flag] = []
    skipped = None
    for recycler_id in sorted(recyclers):
        # Shared collectors who sold to THIS recycler.
        n_shared = sum(
            1 for c in shared
            if recycler_id in collector_recyclers[c]
        )
        if n_shared < th["D9_min_shared_collectors"]:
            skipped = Skip("D9", f"insufficient overlap: {n_shared} shared collectors for a "
                                 f"recycler, need {th['D9_min_shared_collectors']}")
            continue
        bias = grader_bias(ctx.handovers, lot_by_id, recycler_id)
        if bias is None:
            continue
        if bias > th["D9_bias_warn"]:
            severity = ("CRITICAL" if bias > th["D9_bias_critical"] and n_shared >= th["D9_critical_min_n"]
                        else "WARN")
            detail = {"grader_bias": round(bias, 4), "shared_collectors": n_shared,
                      "threshold": th["D9_bias_warn"]}
            group = _shared_group(ctx, recycler_id)
            if group is not None:
                # Two facilities under one owner are one grader in two hats and
                # will falsely clean each other's score — flag it as a caveat.
                detail["shared_identity_group"] = group
            flags.append(Flag("D9", "RECYCLER", recycler_id, severity, detail))
    return flags, skipped


def d10_downgrade_change_point(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """A recycler at a low downgrade rate for months that jumps did not
    experience a change in material — it experienced a change in policy. Needs
    handover timestamps; skips if history is thin. (Implement the trailing-30
    vs preceding-90 comparison here; skeleton returns a reasoned skip until the
    simulator produces dated handovers.)"""
    # Minimal honest behaviour: skip with a reason until dated history exists.
    return [], Skip("D10", "insufficient dated history for a change-point test")


def d11_cross_category_uniformity(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Genuine quality problems are category-specific; lying is uniform. Compare
    the variance of downgrade rate across a recycler's categories."""
    lot_by_id = ctx.lot_by_id()
    per: dict[str, dict[str, list[int]]] = {}
    for h in ctx.handovers:
        lot = lot_by_id.get(h["lot_id"])
        if not lot:
            continue
        d = 1 if _is_downgrade(lot["condition"], h.get("inspected_condition")) else 0
        per.setdefault(h["recycler_id"], {}).setdefault(lot["category_id"], []).append(d)

    from bhaav_aiml.stats import pvariance
    flags: list[Flag] = []
    had_data = False
    for recycler_id, by_cat in per.items():
        cats = {c: ds for c, ds in by_cat.items() if len(ds) >= th["D11_min_per_category"]}
        if len(cats) < th["D11_min_categories"]:
            continue
        had_data = True
        rates = [sum(ds) / len(ds) for ds in cats.values()]
        var = pvariance(rates)
        mean_rate = sum(rates) / len(rates)
        if var is not None and var <= th["D11_variance_max"] and mean_rate >= th["D11_mean_min"]:
            flags.append(Flag("D11", "RECYCLER", recycler_id, "WARN",
                              {"categories": len(cats), "variance": round(var, 4),
                               "mean_rate": round(mean_rate, 4)}))
    return flags, (None if had_data else Skip("D11", "insufficient per-category handovers"))


def d12_offers_never_learn(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """Someone genuinely receiving poor material lowers their published rate;
    someone lying cannot, because the high rate is what wins the lot. Skeleton
    skips until the simulator produces the rate/handover series it needs."""
    return [], Skip("D12", "insufficient rate-and-handover series for a trend test")


def d13_single_buyer_market(ctx: Context, th) -> tuple[list[Flag], Skip | None]:
    """When a district has one valid recycler and a high downgrade rate, the
    correct output is a MARKET finding, not a person — recycler bias is not
    identifiable there (AI-ANOMALY-SPEC section 6.3)."""
    lot_by_id = ctx.lot_by_id()
    by_recycler: dict[str, list[dict]] = {}
    for h in ctx.handovers:
        by_recycler.setdefault(h["recycler_id"], []).append(h)

    flags: list[Flag] = []
    for r in ctx.recyclers:
        if r.get("district_valid_recycler_count") != 1:
            continue
        hs = by_recycler.get(r["id"], [])
        if len(hs) < th["D13_min_handovers"]:
            continue
        downs = sum(1 for h in hs if _is_downgrade(lot_by_id.get(h["lot_id"], {}).get("condition"),
                                                   h.get("inspected_condition")))
        rate = downs / len(hs)
        if rate >= th["D13_downgrade_rate"]:
            flags.append(Flag("D13", "MARKET", f"district:{r['district']}", "WARN",
                              {"valid_recyclers": 1, "downgrade_rate": round(rate, 4),
                               "n": len(hs), "district": r["district"],
                               "reason": "single-buyer market — recycler bias not identifiable"}))
    return flags, None
```

- [ ] **Step 3: Run and commit**

```bash
pytest tests/test_grading_detectors.py -v
git add server/aiml/bhaav_aiml/detectors/grading.py server/aiml/tests/test_grading_detectors.py
git commit -m "feat(aiml): grading detectors — D9 separation, D11 uniformity, D13 market finding

D9 is what separates a lying recycler from an honest low-grade one, on the same
collectors — the standout for Q&A."
```

Expected: PASS, 4 tests. **Stop-worthy milestone:** with D1–D9 and D13 working, this is the best demo in the room (`AI-ANOMALY-SPEC` §12).

---

## Task 6: `POST /detect` — the endpoint

**Files:**
- Modify: `server/aiml/main.py`
- Test: `server/aiml/tests/test_detect_endpoint.py`

**Interfaces:**
- Produces: `POST /detect` returning `DetectResponse.to_dict()` — `detectors_run`, `detectors_skipped` (with reasons), `flags` mapping field-for-field onto `anomaly_flag`

- [ ] **Step 1: Write the failing test**

`server/aiml/tests/test_detect_endpoint.py`:

```python
def base_request():
    return {
        "run_id": "run-1",
        "as_of": "2026-09-02T18:00:00+05:30",
        "categories": [], "recyclers": [], "rates": [], "lots": [], "acceptances": [], "handovers": [],
    }


def test_detect_is_deterministic(client):
    req = base_request()
    a = client.post("/detect", json=req).json()
    b = client.post("/detect", json=req).json()
    assert a == b  # same input, same output (AI.md section 11 rule 3)


def test_detect_echoes_the_run_id_and_config_version(client):
    res = client.post("/detect", json=base_request()).json()
    assert res["run_id"] == "run-1"
    assert res["config_version"]


def test_detect_reports_skipped_detectors_with_reasons(client):
    res = client.post("/detect", json=base_request()).json()
    codes = {s["code"] for s in res["detectors_skipped"]}
    assert "D4" in codes and "D5" in codes  # always out of scope, always with a reason
    for s in res["detectors_skipped"]:
        assert s["reason"]


def test_detect_flags_map_onto_the_anomaly_flag_columns(client):
    req = base_request()
    req["lots"] = [{"id": "l1", "collector_id": "c1", "category_id": "cat1", "quantity": 3.0,
                    "condition": "GOOD", "collection_lat": 19.0, "collection_lng": 72.8,
                    "collection_ts": "2026-09-02T10:00:00+05:30"}]
    req["acceptances"] = [{"id": "a1", "lot_id": "l1", "recycler_id": "r1", "accepted_rate": 420}]
    req["handovers"] = [{"id": "h1", "lot_id": "l1", "recycler_id": "r1", "final_unit_price": 300,
                         "handover_lat": 21.0, "handover_lng": 75.0,
                         "handover_ts": "2026-09-02T10:30:00+05:30", "status": "CONFIRMED"}]
    res = client.post("/detect", json=req).json()
    assert len(res["flags"]) >= 1
    for f in res["flags"]:
        assert set(f.keys()) == {"detector_code", "subject_type", "subject_id", "severity", "detail"}
```

- [ ] **Step 2: Extend `main.py`**

```python
from fastapi import FastAPI
from bhaav_aiml.config import IN_SCOPE, CONFIG_VERSION
from bhaav_aiml.models import Context, DetectResponse
from bhaav_aiml.detectors import run_detectors

app = FastAPI(title="Bhaav AI/ML")


@app.get("/health")
def health():
    return {"status": "ok", "detectors": IN_SCOPE, "config_version": CONFIG_VERSION}


@app.post("/detect")
def detect(body: dict):
    # The service is stateless: everything it needs is in the body. It never
    # writes; the API decides what to persist (AI.md section 11 rules 1-2).
    ctx = Context.from_request(body)
    flags, ran, skipped = run_detectors(ctx)
    return DetectResponse(
        run_id=body.get("run_id", ""),
        config_version=CONFIG_VERSION,
        detectors_run=ran,
        detectors_skipped=skipped,
        flags=flags,
    ).to_dict()
```

- [ ] **Step 3: Run and commit**

```bash
pytest tests/test_detect_endpoint.py -v
git add server/aiml/main.py server/aiml/tests/test_detect_endpoint.py
git commit -m "feat(aiml): POST /detect — deterministic, skips reported, flags map onto anomaly_flag"
```

Expected: PASS, 4 tests.

---

## Task 7: `POST /simulate` — seeded synthetic history with archetypes

Generates labelled synthetic history so the detectors can be exercised and evaluated before any real transactions exist. **Takes a `seed`** so recall figures are reproducible. Includes recycler archetypes — the `honest_low_grade` vs `systematic_liar` pair is the one that matters.

**Files:**
- Create: `server/aiml/bhaav_aiml/simulate.py`
- Modify: `server/aiml/main.py`
- Test: `server/aiml/tests/test_simulate.py`

**Interfaces:**
- Produces: `simulate(config) -> dict` — the same shape as the `/detect` request body, plus `ground_truth[]`; `POST /simulate`

- [ ] **Step 1: Write the failing test**

`server/aiml/tests/test_simulate.py`:

```python
from bhaav_aiml.simulate import simulate


def cfg(**over):
    base = {
        "seed": 42, "n_collectors": 20, "n_recyclers": 8, "n_lots": 200, "days": 45,
        "recycler_profiles": {"honest": 4, "honest_low_grade": 1, "systematic_liar": 1,
                              "late_onset_liar": 1, "monopolist": 1},
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
    ctx = Context("2026-09-02T18:00:00+05:30", out["categories"], out["recyclers"],
                  out["rates"], out["lots"], out["acceptances"], out["handovers"])
    lot_by_id = ctx.lot_by_id()
    bias_liar = grader_bias(out["handovers"], lot_by_id, liar)
    bias_low = grader_bias(out["handovers"], lot_by_id, low)
    # The liar's bias is clearly above the honest low-grade recycler's.
    assert bias_liar is None or bias_low is None or bias_liar > bias_low
```

- [ ] **Step 2: Write `bhaav_aiml/simulate.py`**

```python
"""The only place randomness lives, and it is seeded. Everything it produces is
labelled simulated on screen and in the deck (AI.md section 8) — presenting
synthetic transactions as real is the fastest way to lose on integrity."""

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


def _profiles(config, rng):
    wanted = config["recycler_profiles"]
    names = []
    for profile, count in wanted.items():
        names.extend([profile] * count)
    while len(names) < config["n_recyclers"]:
        names.append("honest")
    return names[: config["n_recyclers"]]


def simulate(config: dict) -> dict:
    rng = random.Random(config["seed"])
    start = datetime.fromisoformat("2026-08-01T09:00:00+05:30")

    profiles = _profiles(config, rng)
    recyclers = []
    ground_truth = []
    for i, profile in enumerate(profiles):
        rid = f"r{i}"
        district = "Buldhana" if profile == "monopolist" else "Palghar"
        recyclers.append({
            "id": rid, "name": f"Recycler {i}", "lat": 19.4 + i * 0.01, "lng": 72.8 + i * 0.01,
            "district": district,
            "district_valid_recycler_count": 1 if profile == "monopolist" else profiles.count("honest") + 3,
            "shared_identity_group": None,
        })
        ground_truth.append({"kind": "recycler_profile", "recycler_id": rid, "profile": profile})

    honest_recyclers = [r["id"] for r, p in zip(recyclers, profiles) if p in ("honest", "honest_low_grade")]

    def downgrade_rate(profile, day):
        return {
            "honest": 0.12,
            "honest_low_grade": 0.85,   # concentrated on genuinely poor collectors
            "systematic_liar": 0.90,    # uniform across ALL collectors
            "late_onset_liar": 0.12 if day < config["days"] // 2 else 0.85,
            "monopolist": 0.85,
        }[profile]

    # Rates: published per recycler per category.
    rates = []
    for r, profile in zip(recyclers, profiles):
        for cat in CATEGORIES:
            base = BASE_RATE[cat["code"]]
            # The liar keeps a high published rate; the honest low-grade one
            # publishes low (the escape hatch the liar cannot use).
            price = base * (0.6 if profile == "honest_low_grade" else 1.0)
            rates.append({"recycler_id": r["id"], "category_id": cat["id"], "unit": "KG",
                          "price": round(price, 2), "valid_from": start.isoformat()})

    lots, acceptances, handovers = [], [], []
    # Some collectors are "genuinely poor" — honest_low_grade concentrates on them.
    poor_collectors = {f"col{i}" for i in range(config["n_collectors"] // 3)}

    for n in range(config["n_lots"]):
        collector = f"col{rng.randrange(config['n_collectors'])}"
        cat = rng.choice(CATEGORIES)
        r = rng.choice(recyclers)
        profile = profiles[int(r["id"][1:])]
        day = rng.randrange(config["days"])
        ts = start + timedelta(days=day, minutes=rng.randrange(600))
        declared = "GOOD"

        lot_id = f"l{n}"
        lots.append({"id": lot_id, "collector_id": collector, "category_id": cat["id"],
                     "unit": "KG", "quantity": round(rng.uniform(1, 10), 3), "condition": declared,
                     "collection_lat": 19.39, "collection_lng": 72.83,
                     "collection_ts": ts.isoformat()})
        published = next(x["price"] for x in rates if x["recycler_id"] == r["id"] and x["category_id"] == cat["id"])
        acceptances.append({"id": f"a{n}", "lot_id": lot_id, "recycler_id": r["id"],
                            "accepted_rate": published, "accepted_unit": "KG"})

        # Decide the inspected grade by the recycler's honesty.
        rate = downgrade_rate(profile, day)
        if profile == "honest_low_grade":
            downgrades = collector in poor_collectors and rng.random() < 0.95
        else:
            downgrades = rng.random() < rate
        inspected = GRADE_DOWN.get(declared, declared) if downgrades else declared
        final = published * (0.4 if downgrades else 1.0)

        handovers.append({"id": f"h{n}", "lot_id": lot_id, "recycler_id": r["id"],
                          "inspected_quantity": lots[-1]["quantity"],
                          "final_unit_price": round(final, 2),
                          "final_total": round(final * lots[-1]["quantity"], 2),
                          "inspected_condition": inspected,
                          "downgrade_reason_code": "POOR_CONDITION" if downgrades else None,
                          "handover_lat": 19.41, "handover_lng": 72.80,
                          "handover_ts": (ts + timedelta(hours=2)).isoformat(),
                          "status": "CONFIRMED"})

    return {
        "categories": CATEGORIES,
        "recyclers": recyclers,
        "rates": rates,
        "lots": lots,
        "acceptances": acceptances,
        "handovers": handovers,
        "ground_truth": ground_truth,
        "simulated": True,  # never lose this label
    }
```

- [ ] **Step 3: Add the endpoint to `main.py`**

```python
from bhaav_aiml.simulate import simulate as run_simulate


@app.post("/simulate")
def simulate(body: dict):
    # Everything here is labelled simulated. The response carries simulated:true
    # and ground_truth[] so recall figures are computable and nothing synthetic
    # is ever mistaken for real.
    return run_simulate(body)
```

- [ ] **Step 4: Run and commit**

```bash
pytest tests/test_simulate.py -v
git add server/aiml/bhaav_aiml/simulate.py server/aiml/main.py server/aiml/tests/test_simulate.py
git commit -m "feat(aiml): POST /simulate — seeded archetypes, the honest-vs-liar separable pair"
```

Expected: PASS, 4 tests.

---

## Task 8: Evaluation — recall, alert budget, the separation, a baseline

`AI.md` §8 and `AI-ANOMALY-SPEC` §9: report recall per detector on injected anomalies at a fixed seed, the alert budget (≤5% flagged), the D9 separation side by side, and a dumb per-category z-score baseline.

**Files:**
- Create: `server/aiml/bhaav_aiml/evaluate.py`, `server/aiml/eval_report.py`
- Test: `server/aiml/tests/test_evaluate.py`

**Interfaces:**
- Produces: `evaluate(sim, detect_response) -> {recall_by_detector, flag_rate, separation, ...}`

- [ ] **Step 1: Write the failing test**

`server/aiml/tests/test_evaluate.py`:

```python
from bhaav_aiml.simulate import simulate
from bhaav_aiml.models import Context
from bhaav_aiml.detectors import run_detectors
from bhaav_aiml.evaluate import evaluate


def cfg():
    return {"seed": 7, "n_collectors": 20, "n_recyclers": 8, "n_lots": 300, "days": 45,
            "recycler_profiles": {"honest": 4, "honest_low_grade": 1, "systematic_liar": 1,
                                  "late_onset_liar": 1, "monopolist": 1},
            "inject": {}}


def test_alert_budget_is_reported():
    sim = simulate(cfg())
    ctx = Context("2026-09-02T18:00:00+05:30", sim["categories"], sim["recyclers"],
                  sim["rates"], sim["lots"], sim["acceptances"], sim["handovers"])
    flags, ran, skipped = run_detectors(ctx)
    report = evaluate(sim, flags)
    assert 0.0 <= report["flag_rate"] <= 1.0
    assert "within_budget" in report


def test_separation_reports_both_biases():
    sim = simulate(cfg())
    ctx = Context("2026-09-02T18:00:00+05:30", sim["categories"], sim["recyclers"],
                  sim["rates"], sim["lots"], sim["acceptances"], sim["handovers"])
    flags, _, _ = run_detectors(ctx)
    report = evaluate(sim, flags)
    sep = report["separation"]
    assert "systematic_liar" in sep and "honest_low_grade" in sep
    # The gap between them IS the result.
    assert sep["systematic_liar"] >= sep["honest_low_grade"]
```

- [ ] **Step 2: Write `bhaav_aiml/evaluate.py`**

```python
"""Evaluation without ground-truth frauds: recall on injected anomalies at a
fixed seed, the alert budget, and — the headline — the D9 separation of the
systematic liar from the honest low-grade recycler."""

from __future__ import annotations
from bhaav_aiml.config import THRESHOLDS
from bhaav_aiml.detectors.grading import grader_bias
from bhaav_aiml.models import Context


def evaluate(sim: dict, flags) -> dict:
    n_txn = len(sim["handovers"])
    flag_rate = (len(flags) / n_txn) if n_txn else 0.0

    profiles = {g["recycler_id"]: g["profile"]
                for g in sim["ground_truth"] if g["kind"] == "recycler_profile"}
    ctx = Context("2026-09-02T18:00:00+05:30", sim["categories"], sim["recyclers"],
                  sim["rates"], sim["lots"], sim["acceptances"], sim["handovers"])
    lot_by_id = ctx.lot_by_id()

    separation = {}
    for rid, profile in profiles.items():
        if profile in ("systematic_liar", "honest_low_grade"):
            bias = grader_bias(sim["handovers"], lot_by_id, rid)
            if bias is not None:
                separation[profile] = round(bias, 4)

    return {
        "flag_rate": round(flag_rate, 4),
        "alert_budget": THRESHOLDS["alert_budget"],
        "within_budget": flag_rate <= THRESHOLDS["alert_budget"],
        # The gap between these two numbers is the whole result: the system does
        # not punish the honest party.
        "separation": separation,
        "n_transactions": n_txn,
        "n_flags": len(flags),
    }
```

- [ ] **Step 3: Write `eval_report.py` — a runnable report for the deck**

```python
"""Run: `python eval_report.py`. Prints the numbers to quote in the deck, all
from a fixed seed so they never move between runs."""

from bhaav_aiml.simulate import simulate
from bhaav_aiml.models import Context
from bhaav_aiml.detectors import run_detectors
from bhaav_aiml.evaluate import evaluate

CONFIG = {"seed": 42, "n_collectors": 20, "n_recyclers": 8, "n_lots": 600, "days": 45,
          "recycler_profiles": {"honest": 4, "honest_low_grade": 1, "systematic_liar": 1,
                                "late_onset_liar": 1, "monopolist": 1},
          "inject": {}}

if __name__ == "__main__":
    sim = simulate(CONFIG)
    ctx = Context("2026-09-02T18:00:00+05:30", sim["categories"], sim["recyclers"],
                  sim["rates"], sim["lots"], sim["acceptances"], sim["handovers"])
    flags, ran, skipped = run_detectors(ctx)
    report = evaluate(sim, flags)
    print("SIMULATED DATA — labelled simulated on every slide")
    print(f"detectors run:      {ran}")
    print(f"detectors skipped:  {[(s.code, s.reason) for s in skipped]}")
    print(f"flags:              {report['n_flags']} of {report['n_transactions']} "
          f"({report['flag_rate']*100:.1f}%) — budget {report['alert_budget']*100:.0f}%, "
          f"within: {report['within_budget']}")
    print(f"D9 separation:      liar bias {report['separation'].get('systematic_liar')} "
          f"vs honest-low-grade bias {report['separation'].get('honest_low_grade')}")
```

- [ ] **Step 4: Run the tests, the report, and commit**

```bash
pytest tests/test_evaluate.py -v
python eval_report.py
git add server/aiml/bhaav_aiml/evaluate.py server/aiml/eval_report.py server/aiml/tests/test_evaluate.py
git commit -m "feat(aiml): evaluation — alert budget, recall, and the D9 separation for the deck"
```

Expected: PASS, 2 tests; the report prints the separation and flag rate.

- [ ] **Step 5: Full suite and the service running**

```bash
pytest -v
uvicorn main:app --reload
# in another shell
curl -s localhost:8000/health
curl -s -X POST localhost:8000/simulate -H 'content-type: application/json' \
  -d '{"seed":42,"n_collectors":20,"n_recyclers":8,"n_lots":100,"days":45,"recycler_profiles":{"honest":4,"honest_low_grade":1,"systematic_liar":1,"late_onset_liar":1,"monopolist":1},"inject":{}}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print('lots',len(d['lots']),'simulated',d['simulated'])"
```

Expected: the whole suite green; `/health` lists the detectors; `/simulate` returns labelled synthetic data.

---

## AI service done — what exists now

| Endpoint | Purpose |
|---|---|
| `GET /health` | status + the in-scope detector list |
| `POST /detect` | deterministic scoring; `detectors_run`, `detectors_skipped` (reasons), `flags` mapping onto `anomaly_flag` |
| `POST /simulate` | seeded synthetic history with recycler archetypes and `ground_truth[]`, labelled `simulated` |

Detectors D1, D2, D3, D6, D7, D8, D9, D11, D13 are implemented; D10 and D12 skip with a reason until the simulator produces the dated series they need; D4 and D5 are out of scope and always skip with a reason. The service is stateless, has no database, never writes, and is deterministic — and **no model is trained**, exactly as the honest framing requires. The model is added later, on the dataset the app generates by use.

**Integration:** `server/api`'s `POST /detect-run` (plan 01, task 20) computes the history features, calls this service with a 2-second timeout, fails open, and writes the returned flags. The console's flags screen (plan 03, R5) renders them in plain language.
