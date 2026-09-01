from __future__ import annotations

from datetime import date, timedelta

import pytest

from backend.nutrition import aggregate as agg


def d(offset: int) -> date:
    return date(2026, 1, 1) + timedelta(days=offset)


# --- sum_nutrients -------------------------------------------------------


def test_sum_nutrients_adds_across_items():
    total = agg.sum_nutrients([{"energy_kcal": 100, "protein_g": 10}, {"energy_kcal": 50, "fat_g": 5}])
    assert total == {"energy_kcal": 150, "protein_g": 10, "fat_g": 5}


def test_sum_nutrients_empty_list():
    assert agg.sum_nutrients([]) == {}


# --- rolling_average -------------------------------------------------


def test_rolling_average_over_full_week():
    daily = {d(i): {"energy_kcal": 2000.0} for i in range(7)}
    avg = agg.rolling_average(daily, end_date=d(6), window_days=7)
    assert avg["energy_kcal"] == pytest.approx(2000.0)


def test_rolling_average_treats_missing_days_as_zero():
    # Only 2 of 7 days logged -- missing days count as zero, not excluded.
    daily = {d(0): {"energy_kcal": 2000.0}, d(6): {"energy_kcal": 2000.0}}
    avg = agg.rolling_average(daily, end_date=d(6), window_days=7)
    assert avg["energy_kcal"] == pytest.approx(2000.0 * 2 / 7)


def test_rolling_average_shrinks_window_for_new_users():
    # Only 3 days of app history -- average over 3, not 7, so it isn't
    # artificially deflated in the first week.
    daily = {d(0): {"energy_kcal": 2000.0}, d(1): {"energy_kcal": 2000.0}, d(2): {"energy_kcal": 2000.0}}
    avg = agg.rolling_average(daily, end_date=d(2), window_days=7, days_of_history=3)
    assert avg["energy_kcal"] == pytest.approx(2000.0)


def test_rolling_average_days_of_history_capped_at_window():
    daily = {d(i): {"energy_kcal": 2000.0} for i in range(7)}
    avg = agg.rolling_average(daily, end_date=d(6), window_days=7, days_of_history=365)
    assert avg["energy_kcal"] == pytest.approx(2000.0)


# --- compute_micronutrient_progress -------------------------------------


def test_micronutrient_progress_pct_rda():
    daily_totals = {"vitamin_c_mg": 45.0}  # male RDA is 90mg
    progress = agg.compute_micronutrient_progress(daily_totals, sex="male", age_years=30)
    vit_c = next(p for p in progress if p.key == "vitamin_c_mg")
    assert vit_c.pct_rda == pytest.approx(50.0)
    assert vit_c.rda == 90


def test_micronutrient_progress_zero_when_unlogged():
    progress = agg.compute_micronutrient_progress({}, sex="female", age_years=30)
    calcium = next(p for p in progress if p.key == "calcium_mg")
    assert calcium.amount == 0
    assert calcium.pct_rda == 0


def test_micronutrient_progress_flags_near_ul():
    # Iron UL is 45mg; 95% of that should trip the near-UL flag.
    daily_totals = {"iron_mg": 43.0}
    progress = agg.compute_micronutrient_progress(daily_totals, sex="male", age_years=30)
    iron = next(p for p in progress if p.key == "iron_mg")
    assert iron.near_ul


def test_micronutrient_progress_not_near_ul_when_well_under():
    daily_totals = {"iron_mg": 10.0}
    progress = agg.compute_micronutrient_progress(daily_totals, sex="male", age_years=30)
    iron = next(p for p in progress if p.key == "iron_mg")
    assert not iron.near_ul


def test_micronutrient_progress_none_ul_for_nutrients_without_one():
    progress = agg.compute_micronutrient_progress({}, sex="male", age_years=30)
    calcium = next(p for p in progress if p.key == "calcium_mg")
    assert calcium.ul is None
    assert not calcium.near_ul


def test_micronutrient_progress_covers_all_22_nutrients():
    progress = agg.compute_micronutrient_progress({}, sex="male", age_years=30)
    assert len(progress) == 22
