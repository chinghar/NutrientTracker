from __future__ import annotations

import pytest

from backend.nutrition.scale import calorie_range, scale_per_100g


def test_scale_per_100g_halves_at_50_grams():
    assert scale_per_100g(200, 50) == pytest.approx(100)


def test_scale_per_100g_doubles_at_200_grams():
    assert scale_per_100g(200, 200) == pytest.approx(400)


def test_scale_per_100g_zero_grams_is_zero():
    assert scale_per_100g(200, 0) == 0


def test_calorie_range_collapses_at_full_confidence():
    low, high = calorie_range(500, confidence=1.0)
    assert low == pytest.approx(500)
    assert high == pytest.approx(500)


def test_calorie_range_widest_at_zero_confidence():
    low, high = calorie_range(500, confidence=0.0, max_deviation_pct=0.3)
    assert low == pytest.approx(350)
    assert high == pytest.approx(650)


def test_calorie_range_never_goes_negative():
    low, high = calorie_range(100, confidence=0.0, max_deviation_pct=2.0)
    assert low == 0.0
    assert high == pytest.approx(300)


def test_calorie_range_clamps_out_of_bounds_confidence():
    low, high = calorie_range(500, confidence=1.5)
    assert low == pytest.approx(500)
    assert high == pytest.approx(500)
