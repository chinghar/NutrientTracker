"""Adaptive TDEE calibration: detect systematic under/over-logging by
comparing observed bodyweight trend against logged calorie intake, and
derive a correction factor. This is the feature that closes the gap on
published apps underestimating calories by roughly a third -- build and
change it carefully.

No I/O here -- callers fetch weight/meal history and pass it in.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from backend.nutrition.targets import KCAL_PER_KG_BODY_MASS, CalorieFloorResult, Sex, apply_calorie_floor

MIN_CALIBRATION_DAYS = 14
DEFAULT_EWMA_ALPHA = 0.1


def ewma_smooth(weights: list[tuple[date, float]], alpha: float = DEFAULT_EWMA_ALPHA) -> list[tuple[date, float]]:
    """Exponentially-weighted moving average over (date, weight_kg) points,
    to strip day-to-day water-weight noise out of the trend. Input need not
    be pre-sorted; output is sorted by date, one point per input point."""
    if not weights:
        return []
    ordered = sorted(weights, key=lambda w: w[0])
    smoothed = [ordered[0]]
    level = ordered[0][1]
    for d, w in ordered[1:]:
        level = alpha * w + (1 - alpha) * level
        smoothed.append((d, level))
    return smoothed


@dataclass(frozen=True)
class CalibrationResult:
    logging_bias_factor: float  # < 1.0 means logs read low vs. true intake
    true_avg_daily_calories: float
    bias_pct: float  # e.g. 22.0 for "22% low"; negative if logs read high
    days: int


def estimate_logging_bias(
    smoothed_weights: list[tuple[date, float]],
    avg_logged_calories_per_day: float,
    assumed_tdee: float,
) -> CalibrationResult | None:
    """Compares the weight trend implied by smoothed_weights against what
    logged calories predict, to back out a true average intake and the
    logging bias factor. Returns None if there isn't yet enough history --
    require at least MIN_CALIBRATION_DAYS between the first and last
    weigh-in, per spec.
    """
    if len(smoothed_weights) < 2:
        return None

    start_date, start_weight = smoothed_weights[0]
    end_date, end_weight = smoothed_weights[-1]
    days = (end_date - start_date).days
    if days < MIN_CALIBRATION_DAYS:
        return None

    observed_change_kg = end_weight - start_weight
    true_avg_daily_calories = assumed_tdee + (observed_change_kg * KCAL_PER_KG_BODY_MASS) / days

    if true_avg_daily_calories <= 0:
        return None

    bias_factor = avg_logged_calories_per_day / true_avg_daily_calories
    bias_pct = (1 - bias_factor) * 100

    return CalibrationResult(
        logging_bias_factor=bias_factor,
        true_avg_daily_calories=true_avg_daily_calories,
        bias_pct=bias_pct,
        days=days,
    )


def apply_calibration(target_calories: float, bias_factor: float, bmr: float, sex: Sex) -> CalorieFloorResult:
    """Scales a true-intake calorie target down (or up) by the logging bias
    factor, so that hitting the *logged* number corresponds to actually
    eating the true target -- then re-applies the Phase 2 safety floor,
    since calibration must never push a prescribed number below it."""
    adjusted = target_calories * bias_factor
    return apply_calorie_floor(adjusted, bmr, sex)
