from __future__ import annotations

from datetime import date, timedelta

import pytest

from backend.nutrition import calibration as c


def d(offset: int) -> date:
    return date(2026, 1, 1) + timedelta(days=offset)


# --- EWMA smoothing ---------------------------------------------------


def test_ewma_smooth_empty():
    assert c.ewma_smooth([]) == []


def test_ewma_smooth_first_point_unchanged():
    smoothed = c.ewma_smooth([(d(0), 80.0)])
    assert smoothed == [(d(0), 80.0)]


def test_ewma_smooth_dampens_a_single_spike():
    # A one-day water-weight spike shouldn't fully carry through.
    weights = [(d(0), 80.0), (d(1), 82.0), (d(2), 80.0)]
    smoothed = c.ewma_smooth(weights, alpha=0.2)
    assert smoothed[1][1] < 82.0
    assert smoothed[1][1] > 80.0


def test_ewma_smooth_sorts_unordered_input():
    weights = [(d(2), 79.0), (d(0), 80.0), (d(1), 81.0)]
    smoothed = c.ewma_smooth(weights)
    assert [day for day, _ in smoothed] == [d(0), d(1), d(2)]


def test_ewma_smooth_converges_toward_constant_input():
    weights = [(d(i), 80.0) for i in range(10)]
    smoothed = c.ewma_smooth(weights, alpha=0.3)
    assert all(w == pytest.approx(80.0) for _, w in smoothed)


# --- Logging bias estimation --------------------------------------------


def test_estimate_logging_bias_none_with_fewer_than_two_points():
    assert c.estimate_logging_bias([(d(0), 80.0)], avg_logged_calories_per_day=2000, assumed_tdee=2500) is None


def test_estimate_logging_bias_none_before_min_days():
    weights = [(d(0), 80.0), (d(10), 80.5)]  # only 10 days, need 14
    assert c.estimate_logging_bias(weights, avg_logged_calories_per_day=2000, assumed_tdee=2500) is None


def test_estimate_logging_bias_detects_underestimation():
    # TDEE=2500. Over 20 days the user gained 0.5kg despite logging 2000
    # kcal/day (a supposed 500kcal deficit) -- their logs must be reading low.
    weights = [(d(0), 80.0), (d(20), 80.5)]
    result = c.estimate_logging_bias(weights, avg_logged_calories_per_day=2000, assumed_tdee=2500)
    assert result is not None
    assert result.days == 20
    assert result.true_avg_daily_calories == pytest.approx(2500 + 0.5 * 7700 / 20)
    assert result.logging_bias_factor < 1.0
    assert result.bias_pct > 0


def test_estimate_logging_bias_accurate_logging_gives_factor_near_one():
    # A genuine, accurately-logged 500kcal/day deficit over 20 days predicts
    # a specific weight loss; if the observed loss matches exactly, bias = 1.
    tdee = 2500
    avg_logged = 2000
    days = 20
    predicted_change_kg = (avg_logged - tdee) * days / c.KCAL_PER_KG_BODY_MASS
    weights = [(d(0), 80.0), (d(days), 80.0 + predicted_change_kg)]
    result = c.estimate_logging_bias(weights, avg_logged_calories_per_day=avg_logged, assumed_tdee=tdee)
    assert result is not None
    assert result.logging_bias_factor == pytest.approx(1.0, abs=1e-6)
    assert result.bias_pct == pytest.approx(0.0, abs=1e-4)


def test_estimate_logging_bias_detects_overestimation():
    # User logs 2000 kcal/day but loses much more weight than that deficit
    # would predict -- they're actually eating less than logged.
    weights = [(d(0), 80.0), (d(20), 78.0)]
    result = c.estimate_logging_bias(weights, avg_logged_calories_per_day=2000, assumed_tdee=2500)
    assert result is not None
    assert result.logging_bias_factor > 1.0
    assert result.bias_pct < 0


# --- Applying calibration to a target, with the floor ------------------


def test_apply_calibration_scales_target_down_for_underestimation_bias():
    result = c.apply_calibration(target_calories=2000, bias_factor=0.78, bmr=1400, sex="male")
    assert result.calories == pytest.approx(1560)
    assert not result.clamped


def test_apply_calibration_never_goes_below_floor():
    # An extreme bias factor would push this below the male 1500 floor.
    result = c.apply_calibration(target_calories=1600, bias_factor=0.5, bmr=1400, sex="male")
    assert result.clamped
    assert result.calories == pytest.approx(1500)


def test_apply_calibration_never_goes_below_bmr():
    result = c.apply_calibration(target_calories=2000, bias_factor=0.5, bmr=1800, sex="female")
    assert result.clamped
    assert result.calories == pytest.approx(1800)
