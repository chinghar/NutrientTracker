"""Calorie and macro targets engine.

Pure functions only — no I/O, no framework code. Every safety rail here
(calorie floor, BMI floor, minimum age) is a hard constraint enforced in the
math itself, not a UI suggestion that can be bypassed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Sex = Literal["male", "female"]
ActivityLevel = Literal["sedentary", "light", "moderate", "heavy", "athlete"]
Goal = Literal["fat_loss", "muscle_gain", "maintenance"]

ACTIVITY_FACTORS: dict[ActivityLevel, float] = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "heavy": 1.725,
    "athlete": 1.9,
}

# Approximate energy density of body mass, used to convert a weekly
# bodyweight-change cap into a daily calorie deficit/surplus cap.
KCAL_PER_KG_BODY_MASS = 7700

MIN_DEFICIT_PCT = 0.15
MAX_DEFICIT_PCT = 0.25
DEFAULT_DEFICIT_PCT = 0.20
MAX_WEEKLY_LOSS_PCT_BODYWEIGHT = 0.010

MIN_SURPLUS_PCT = 0.10
MAX_SURPLUS_PCT = 0.15
DEFAULT_SURPLUS_PCT = 0.125
MAX_WEEKLY_GAIN_PCT_BODYWEIGHT = 0.005

CALORIE_FLOOR_BY_SEX: dict[Sex, float] = {"male": 1500, "female": 1200}

PROTEIN_G_PER_KG_BODYWEIGHT_DEFAULT = 1.9  # midpoint of 1.6-2.2 g/kg
PROTEIN_G_PER_KG_LEANMASS_DEFICIT_DEFAULT = 2.2  # midpoint of 2.0-2.4 g/kg
FAT_MIN_G_PER_KG_BODYWEIGHT = 0.6
FAT_DEFAULT_PCT_OF_CALORIES = 0.25
FIBER_G_PER_1000_KCAL = 14

MIN_AGE_YEARS = 18
BMI_FLOOR = 18.5


class MinorAgeError(ValueError):
    """Raised when age < 18. The app must never generate a deficit, or any
    targets at all, for a minor."""


class BMIFloorError(ValueError):
    """Raised when a goal weight would put the user below a BMI of 18.5."""


def calculate_bmi(weight_kg: float, height_cm: float) -> float:
    height_m = height_cm / 100
    return weight_kg / (height_m**2)


def validate_age(age_years: float) -> None:
    if age_years < MIN_AGE_YEARS:
        raise MinorAgeError(
            "This app can't generate nutrition targets for anyone under 18. "
            "Please talk to a doctor or registered dietitian instead."
        )


def validate_goal_weight(goal_weight_kg: float, height_cm: float) -> None:
    bmi = calculate_bmi(goal_weight_kg, height_cm)
    if bmi < BMI_FLOOR:
        raise BMIFloorError(
            f"That goal weight works out to a BMI of {bmi:.1f}, below the "
            f"{BMI_FLOOR} floor this app enforces. Please choose a higher goal weight."
        )


def calculate_lean_mass_kg(weight_kg: float, body_fat_pct: float) -> float:
    return weight_kg * (1 - body_fat_pct / 100)


def calculate_bmr(
    weight_kg: float,
    height_cm: float,
    age_years: float,
    sex: Sex,
    body_fat_pct: float | None = None,
) -> float:
    if body_fat_pct is not None:
        lbm_kg = calculate_lean_mass_kg(weight_kg, body_fat_pct)
        return 370 + 21.6 * lbm_kg
    if sex == "male":
        return 10 * weight_kg + 6.25 * height_cm - 5 * age_years + 5
    return 10 * weight_kg + 6.25 * height_cm - 5 * age_years - 161


def calculate_tdee(bmr: float, activity_level: ActivityLevel) -> float:
    return bmr * ACTIVITY_FACTORS[activity_level]


@dataclass(frozen=True)
class GoalAdjustmentResult:
    calories: float
    applied_pct: float  # actual deficit/surplus fraction of TDEE, after any rate cap
    rate_capped: bool  # True if the weekly-bodyweight-change cap reduced the requested %


def apply_goal_adjustment(
    tdee: float,
    goal: Goal,
    weight_kg: float,
    rate_pct: float | None = None,
) -> GoalAdjustmentResult:
    if goal == "maintenance":
        return GoalAdjustmentResult(calories=tdee, applied_pct=0.0, rate_capped=False)

    if goal == "fat_loss":
        if rate_pct is None:
            requested_pct = DEFAULT_DEFICIT_PCT
        else:
            requested_pct = min(max(rate_pct, MIN_DEFICIT_PCT), MAX_DEFICIT_PCT)
        requested_kcal = tdee * requested_pct
        max_weekly_kcal = MAX_WEEKLY_LOSS_PCT_BODYWEIGHT * weight_kg * KCAL_PER_KG_BODY_MASS
        max_daily_kcal = max_weekly_kcal / 7
        actual_kcal = min(requested_kcal, max_daily_kcal)
        return GoalAdjustmentResult(
            calories=tdee - actual_kcal,
            applied_pct=actual_kcal / tdee,
            rate_capped=actual_kcal < requested_kcal,
        )

    # muscle_gain
    requested_pct = DEFAULT_SURPLUS_PCT if rate_pct is None else rate_pct
    requested_pct = min(max(requested_pct, MIN_SURPLUS_PCT), MAX_SURPLUS_PCT)
    requested_kcal = tdee * requested_pct
    max_weekly_kcal = MAX_WEEKLY_GAIN_PCT_BODYWEIGHT * weight_kg * KCAL_PER_KG_BODY_MASS
    max_daily_kcal = max_weekly_kcal / 7
    actual_kcal = min(requested_kcal, max_daily_kcal)
    return GoalAdjustmentResult(
        calories=tdee + actual_kcal,
        applied_pct=actual_kcal / tdee,
        rate_capped=actual_kcal < requested_kcal,
    )


@dataclass(frozen=True)
class CalorieFloorResult:
    calories: float
    clamped: bool
    explanation: str | None


def apply_calorie_floor(calories: float, bmr: float, sex: Sex) -> CalorieFloorResult:
    floor = max(bmr, CALORIE_FLOOR_BY_SEX[sex])
    if calories < floor:
        return CalorieFloorResult(
            calories=floor,
            clamped=True,
            explanation=(
                f"Your target was raised to {floor:.0f} kcal. Calories can never be "
                f"prescribed below your BMR ({bmr:.0f} kcal) or the safety minimum "
                f"({CALORIE_FLOOR_BY_SEX[sex]:.0f} kcal for {sex})."
            ),
        )
    return CalorieFloorResult(calories=calories, clamped=False, explanation=None)


@dataclass(frozen=True)
class Macros:
    protein_g: float
    fat_g: float
    carb_g: float
    fiber_g: float


def calculate_macros(
    calories: float,
    weight_kg: float,
    goal: Goal,
    lean_mass_kg: float | None = None,
) -> Macros:
    if goal == "fat_loss" and lean_mass_kg is not None:
        protein_g = PROTEIN_G_PER_KG_LEANMASS_DEFICIT_DEFAULT * lean_mass_kg
    else:
        protein_g = PROTEIN_G_PER_KG_BODYWEIGHT_DEFAULT * weight_kg

    fat_g = max(FAT_MIN_G_PER_KG_BODYWEIGHT * weight_kg, FAT_DEFAULT_PCT_OF_CALORIES * calories / 9)

    remaining_kcal = calories - (protein_g * 4 + fat_g * 9)
    carb_g = max(remaining_kcal / 4, 0.0)

    fiber_g = FIBER_G_PER_1000_KCAL * calories / 1000

    return Macros(protein_g=protein_g, fat_g=fat_g, carb_g=carb_g, fiber_g=fiber_g)


@dataclass(frozen=True)
class TargetsResult:
    bmr: float
    tdee: float
    calories: float
    clamped: bool
    clamp_explanation: str | None
    rate_capped: bool
    macros: Macros
    show_eating_disorder_resource: bool


def compute_targets(
    weight_kg: float,
    height_cm: float,
    age_years: float,
    sex: Sex,
    activity_level: ActivityLevel,
    goal: Goal,
    body_fat_pct: float | None = None,
    rate_pct: float | None = None,
    goal_weight_kg: float | None = None,
) -> TargetsResult:
    validate_age(age_years)
    if goal_weight_kg is not None:
        validate_goal_weight(goal_weight_kg, height_cm)

    bmr = calculate_bmr(weight_kg, height_cm, age_years, sex, body_fat_pct)
    tdee = calculate_tdee(bmr, activity_level)
    adjustment = apply_goal_adjustment(tdee, goal, weight_kg, rate_pct)
    floor_result = apply_calorie_floor(adjustment.calories, bmr, sex)

    lean_mass_kg = calculate_lean_mass_kg(weight_kg, body_fat_pct) if body_fat_pct is not None else None
    macros = calculate_macros(floor_result.calories, weight_kg, goal, lean_mass_kg)

    return TargetsResult(
        bmr=bmr,
        tdee=tdee,
        calories=floor_result.calories,
        clamped=floor_result.clamped,
        clamp_explanation=floor_result.explanation,
        rate_capped=adjustment.rate_capped,
        macros=macros,
        show_eating_disorder_resource=floor_result.clamped,
    )
