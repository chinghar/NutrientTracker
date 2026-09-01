from __future__ import annotations

import pytest

from backend.nutrition import targets as t


# --- BMR ---------------------------------------------------------------


def test_bmr_mifflin_st_jeor_male():
    bmr = t.calculate_bmr(weight_kg=80, height_cm=180, age_years=30, sex="male")
    expected = 10 * 80 + 6.25 * 180 - 5 * 30 + 5
    assert bmr == pytest.approx(expected)


def test_bmr_mifflin_st_jeor_female():
    bmr = t.calculate_bmr(weight_kg=65, height_cm=165, age_years=30, sex="female")
    expected = 10 * 65 + 6.25 * 165 - 5 * 30 - 161
    assert bmr == pytest.approx(expected)


def test_bmr_katch_mcardle_used_when_body_fat_given():
    bmr = t.calculate_bmr(weight_kg=80, height_cm=180, age_years=30, sex="male", body_fat_pct=20)
    lbm = 80 * (1 - 0.20)
    expected = 370 + 21.6 * lbm
    assert bmr == pytest.approx(expected)


def test_bmr_katch_mcardle_ignores_sex_dependent_terms():
    # Same weight/body-fat should give identical BMR for male and female
    # once body fat % is supplied, since Katch-McArdle doesn't use sex or age.
    male = t.calculate_bmr(weight_kg=70, height_cm=170, age_years=25, sex="male", body_fat_pct=15)
    female = t.calculate_bmr(weight_kg=70, height_cm=170, age_years=40, sex="female", body_fat_pct=15)
    assert male == pytest.approx(female)


# --- TDEE ----------------------------------------------------------------


@pytest.mark.parametrize(
    "activity_level,factor",
    [
        ("sedentary", 1.2),
        ("light", 1.375),
        ("moderate", 1.55),
        ("heavy", 1.725),
        ("athlete", 1.9),
    ],
)
def test_tdee_activity_factors(activity_level, factor):
    bmr = 1600
    assert t.calculate_tdee(bmr, activity_level) == pytest.approx(bmr * factor)


# --- Goal adjustment -------------------------------------------------------


def test_fat_loss_default_deficit_within_range():
    tdee = 2500
    result = t.apply_goal_adjustment(tdee, "fat_loss", weight_kg=90)  # heavy enough not to be rate-capped
    assert not result.rate_capped
    assert t.MIN_DEFICIT_PCT <= result.applied_pct <= t.MAX_DEFICIT_PCT
    assert result.calories == pytest.approx(tdee * (1 - result.applied_pct))


def test_fat_loss_requested_pct_clamped_into_allowed_range():
    tdee = 2500
    result = t.apply_goal_adjustment(tdee, "fat_loss", weight_kg=90, rate_pct=0.50)
    assert result.applied_pct <= t.MAX_DEFICIT_PCT + 1e-9


def test_fat_loss_capped_by_weekly_bodyweight_loss_limit():
    # Light bodyweight -> the 1%/week cap in kcal is smaller than the
    # requested 25% TDEE deficit, so the rate cap must bind.
    tdee = 2500
    weight_kg = 45
    result = t.apply_goal_adjustment(tdee, "fat_loss", weight_kg=weight_kg, rate_pct=t.MAX_DEFICIT_PCT)
    max_daily_kcal = t.MAX_WEEKLY_LOSS_PCT_BODYWEIGHT * weight_kg * t.KCAL_PER_KG_BODY_MASS / 7
    assert result.rate_capped
    assert result.calories == pytest.approx(tdee - max_daily_kcal)


def test_muscle_gain_default_surplus_within_range():
    tdee = 2500
    result = t.apply_goal_adjustment(tdee, "muscle_gain", weight_kg=90)
    assert not result.rate_capped
    assert t.MIN_SURPLUS_PCT <= result.applied_pct <= t.MAX_SURPLUS_PCT
    assert result.calories == pytest.approx(tdee * (1 + result.applied_pct))


def test_muscle_gain_capped_by_weekly_bodyweight_gain_limit():
    tdee = 2500
    weight_kg = 45
    result = t.apply_goal_adjustment(tdee, "muscle_gain", weight_kg=weight_kg, rate_pct=t.MAX_SURPLUS_PCT)
    max_daily_kcal = t.MAX_WEEKLY_GAIN_PCT_BODYWEIGHT * weight_kg * t.KCAL_PER_KG_BODY_MASS / 7
    assert result.rate_capped
    assert result.calories == pytest.approx(tdee + max_daily_kcal)


def test_maintenance_equals_tdee():
    tdee = 2200
    result = t.apply_goal_adjustment(tdee, "maintenance", weight_kg=80)
    assert result.calories == pytest.approx(tdee)
    assert result.applied_pct == 0.0
    assert not result.rate_capped


# --- Calorie floor ---------------------------------------------------------


def test_calorie_floor_clamps_below_bmr():
    bmr = 1400
    result = t.apply_calorie_floor(calories=1300, bmr=bmr, sex="male")
    assert result.clamped
    assert result.calories == pytest.approx(max(bmr, t.CALORIE_FLOOR_BY_SEX["male"]))
    assert result.explanation is not None


def test_calorie_floor_clamps_below_absolute_minimum_female():
    result = t.apply_calorie_floor(calories=1100, bmr=1000, sex="female")
    assert result.clamped
    assert result.calories == pytest.approx(t.CALORIE_FLOOR_BY_SEX["female"])


def test_calorie_floor_no_clamp_when_above_floor():
    result = t.apply_calorie_floor(calories=1800, bmr=1400, sex="male")
    assert not result.clamped
    assert result.calories == pytest.approx(1800)
    assert result.explanation is None


# --- Validation gates -------------------------------------------------------


def test_minor_age_rejected():
    with pytest.raises(t.MinorAgeError):
        t.validate_age(17)


def test_age_18_is_allowed():
    t.validate_age(18)  # must not raise


def test_goal_weight_below_bmi_floor_rejected():
    # height 170cm, weight 50kg -> BMI ~17.3, below the 18.5 floor
    with pytest.raises(t.BMIFloorError):
        t.validate_goal_weight(goal_weight_kg=50, height_cm=170)


def test_goal_weight_at_bmi_floor_is_allowed():
    # Choose a weight that clears BMI 18.5 at this height.
    t.validate_goal_weight(goal_weight_kg=56, height_cm=170)  # BMI ~19.4, must not raise


# --- Macros ------------------------------------------------------------


def test_macros_use_bodyweight_when_lean_mass_unknown():
    macros = t.calculate_macros(calories=2000, weight_kg=80, goal="maintenance", lean_mass_kg=None)
    assert macros.protein_g == pytest.approx(t.PROTEIN_G_PER_KG_BODYWEIGHT_DEFAULT * 80)


def test_macros_use_lean_mass_in_deficit_when_known():
    macros = t.calculate_macros(calories=1800, weight_kg=80, goal="fat_loss", lean_mass_kg=60)
    assert macros.protein_g == pytest.approx(t.PROTEIN_G_PER_KG_LEANMASS_DEFICIT_DEFAULT * 60)


def test_macros_fat_floor_applies_at_low_calories():
    # At very low calories, 25% of calories in fat grams is less than the
    # 0.6 g/kg bodyweight floor, so the floor must win.
    macros = t.calculate_macros(calories=1200, weight_kg=100, goal="maintenance")
    assert macros.fat_g == pytest.approx(t.FAT_MIN_G_PER_KG_BODYWEIGHT * 100)


def test_macros_fat_uses_calorie_pct_when_it_exceeds_floor():
    macros = t.calculate_macros(calories=3000, weight_kg=60, goal="maintenance")
    assert macros.fat_g == pytest.approx(t.FAT_DEFAULT_PCT_OF_CALORIES * 3000 / 9)


def test_macros_carb_is_never_negative():
    # Tiny calorie budget with a heavy protein+fat floor could otherwise
    # drive carbs negative.
    macros = t.calculate_macros(calories=1200, weight_kg=120, goal="fat_loss", lean_mass_kg=100)
    assert macros.carb_g >= 0


def test_fiber_scales_with_calories():
    macros = t.calculate_macros(calories=2000, weight_kg=80, goal="maintenance")
    assert macros.fiber_g == pytest.approx(t.FIBER_G_PER_1000_KCAL * 2000 / 1000)


# --- End-to-end orchestration -----------------------------------------


def test_compute_targets_end_to_end_fat_loss():
    result = t.compute_targets(
        weight_kg=80,
        height_cm=175,
        age_years=30,
        sex="male",
        activity_level="moderate",
        goal="fat_loss",
    )
    assert result.bmr > 0
    assert result.tdee > result.bmr
    assert result.calories < result.tdee
    assert result.macros.protein_g > 0
    assert not result.show_eating_disorder_resource


def test_compute_targets_clamped_flags_eating_disorder_resource():
    # Very low bodyweight + max deficit should hit the calorie floor.
    result = t.compute_targets(
        weight_kg=42,
        height_cm=150,
        age_years=20,
        sex="female",
        activity_level="sedentary",
        goal="fat_loss",
        rate_pct=t.MAX_DEFICIT_PCT,
    )
    assert result.clamped
    assert result.clamp_explanation is not None
    assert result.show_eating_disorder_resource


def test_compute_targets_rejects_minor():
    with pytest.raises(t.MinorAgeError):
        t.compute_targets(
            weight_kg=60,
            height_cm=165,
            age_years=16,
            sex="female",
            activity_level="light",
            goal="maintenance",
        )


def test_compute_targets_rejects_goal_weight_below_bmi_floor():
    with pytest.raises(t.BMIFloorError):
        t.compute_targets(
            weight_kg=70,
            height_cm=170,
            age_years=25,
            sex="male",
            activity_level="light",
            goal="fat_loss",
            goal_weight_kg=50,
        )
