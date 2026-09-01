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


def std(xs: list[float], sample: bool = False) -> float | None:
    """Population std (default) or sample std. Returns None for empty series."""
    if not xs:
        return None
    return statistics.stdev(xs) if sample else statistics.pstdev(xs)


def z_score(value: float, series: list[float]) -> float | None:
    """Z-score of value relative to series (population std). Returns None when
    std is zero or series is empty — dividing by zero produces no information."""
    if not series:
        return None
    m = statistics.fmean(series)
    s = statistics.pstdev(series)
    if s == 0:
        return None
    return (value - m) / s


def iqr(series: list[float]) -> float | None:
    """Interquartile range (Q3 - Q1). Returns None for empty series."""
    if not series:
        return None
    s = sorted(series)
    n = len(s)
    # Inclusive quartile method (same as statistics.quantiles default).
    q1 = percentile(s, 0.25)
    q3 = percentile(s, 0.75)
    if q1 is None or q3 is None:
        return None
    return q3 - q1


def mad(xs: list[float]) -> float | None:
    """Median absolute deviation — robust to a single outlier, which is exactly
    the shape of a misdeclared-category lot (D5's basis, kept here for reuse)."""
    if not xs:
        return None
    m = statistics.median(xs)
    return statistics.median([abs(x - m) for x in xs])


def is_outlier_iqr(value: float, series: list[float], k: float = 1.5) -> bool:
    """True if value is outside [Q1 - k*IQR, Q3 + k*IQR]. Returns False when
    there is insufficient data to compute IQR."""
    if not series:
        return False
    q1 = percentile(series, 0.25)
    q3 = percentile(series, 0.75)
    if q1 is None or q3 is None:
        return False
    fence = k * (q3 - q1)
    return value < q1 - fence or value > q3 + fence


def is_outlier_z(value: float, series: list[float], threshold: float = 3.0) -> bool:
    """True if abs(z_score) >= threshold. Returns False when z cannot be computed."""
    z = z_score(value, series)
    if z is None:
        return False
    return abs(z) >= threshold


def percentile(xs: list[float], p: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    k = (len(s) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)
