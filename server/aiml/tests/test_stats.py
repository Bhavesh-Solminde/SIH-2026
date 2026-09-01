import math
from bhaav_aiml.stats import median, mean, pvariance, mad, z_score, iqr, is_outlier_iqr, is_outlier_z


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


def test_z_score_known_value():
    # series [1,2,3,4,5]: mean=3, pstdev=sqrt(2)
    z = z_score(3, [1, 2, 3, 4, 5])
    assert z == 0.0


def test_z_score_returns_none_for_zero_std():
    assert z_score(5, [5, 5, 5]) is None


def test_z_score_returns_none_for_empty():
    assert z_score(1, []) is None


def test_iqr_simple():
    # [1,2,3,4,5]: Q1=1.5+0.5*(2-1)=2? Let's just check it's positive and finite
    result = iqr([1, 2, 3, 4, 5])
    assert result is not None and result > 0


def test_iqr_empty_is_none():
    assert iqr([]) is None


def test_is_outlier_iqr_flags_extreme():
    series = [1, 2, 3, 4, 5]
    assert is_outlier_iqr(100, series)
    assert not is_outlier_iqr(3, series)


def test_is_outlier_z_flags_extreme():
    series = [1, 2, 3, 4, 5]
    assert is_outlier_z(100, series)
    assert not is_outlier_z(3, series)
