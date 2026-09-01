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
