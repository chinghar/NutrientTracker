"""Orchestrates the pure nutrition math (backend/nutrition/*) against the
app's own persisted data (profile, bodyweight, logged meals). This module
does the I/O; the actual calculations it calls are pure and unit-tested
independently.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlmodel import Session, select

from backend.models import BodyWeightLog, LoggedMeal, LoggedMealItem, UserProfile
from backend.nutrition.aggregate import compute_micronutrient_progress, rolling_average, sum_nutrients
from backend.nutrition.calibration import apply_calibration, estimate_logging_bias, ewma_smooth
from backend.nutrition.targets import Macros, TargetsResult, compute_targets
from backend.schemas import (
    CalibrationOut,
    DailyTotalsOut,
    DashboardOut,
    MacrosOut,
    MicronutrientProgressOut,
    TargetsOut,
)

ROLLING_WINDOW_DAYS = 7

# SQLAlchemy's SQLite DateTime type stores no UTC offset -- LoggedMeal.logged_at
# comes back naive even though _utcnow() wrote it as UTC. "Today" (date.today())
# is the local calendar day, so bucketing meals by day requires converting that
# naive-but-UTC value to local time first, or every evening (once local time
# has crossed midnight UTC) meals silently vanish from "today"'s dashboard.


def _to_local_date(dt: datetime) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone().date()


def _local_day_bounds_as_naive_utc(day: date) -> tuple[datetime, datetime]:
    """Local midnight-to-midnight of `day`, expressed as naive UTC values
    matching what's actually stored in the logged_at column."""
    local_start = datetime.combine(day, time.min).astimezone()
    local_end = datetime.combine(day, time.max).astimezone()
    return (
        local_start.astimezone(timezone.utc).replace(tzinfo=None),
        local_end.astimezone(timezone.utc).replace(tzinfo=None),
    )


def _daily_totals_by_date(session: Session, start: date, end: date) -> dict[date, dict[str, float]]:
    start_dt, _ = _local_day_bounds_as_naive_utc(start)
    _, end_dt = _local_day_bounds_as_naive_utc(end)
    meals = session.exec(
        select(LoggedMeal).where(LoggedMeal.logged_at >= start_dt).where(LoggedMeal.logged_at <= end_dt)
    ).all()

    per_day: dict[date, list[dict[str, float]]] = {}
    for meal in meals:
        items = session.exec(select(LoggedMealItem).where(LoggedMealItem.meal_id == meal.id)).all()
        per_day.setdefault(_to_local_date(meal.logged_at), []).extend(item.nutrients() for item in items)

    return {day: sum_nutrients(item_nutrients) for day, item_nutrients in per_day.items()}


def _earliest_meal_date(session: Session) -> date | None:
    meal = session.exec(select(LoggedMeal).order_by(LoggedMeal.logged_at)).first()
    return _to_local_date(meal.logged_at) if meal else None


def _to_daily_totals_out(totals: dict[str, float]) -> DailyTotalsOut:
    return DailyTotalsOut(
        calories=totals.get("energy_kcal", 0.0),
        protein_g=totals.get("protein_g", 0.0),
        fat_g=totals.get("fat_g", 0.0),
        carbohydrate_g=totals.get("carbohydrate_g", 0.0),
        fiber_g=totals.get("fiber_g", 0.0),
    )


def _macros_out(macros: Macros) -> MacrosOut:
    return MacrosOut(protein_g=macros.protein_g, fat_g=macros.fat_g, carb_g=macros.carb_g, fiber_g=macros.fiber_g)


def compute_calibrated_targets(session: Session, profile: UserProfile, on_date: date) -> TargetsOut:
    base: TargetsResult = compute_targets(
        weight_kg=profile.weight_kg,
        height_cm=profile.height_cm,
        age_years=profile.age_years,
        sex=profile.sex,
        activity_level=profile.activity_level,
        goal=profile.goal,
        body_fat_pct=profile.body_fat_pct,
        rate_pct=profile.rate_pct,
        goal_weight_kg=profile.goal_weight_kg,
    )

    weight_logs = session.exec(select(BodyWeightLog).order_by(BodyWeightLog.log_date)).all()
    smoothed = ewma_smooth([(w.log_date, w.weight_kg) for w in weight_logs])

    calibration_out: CalibrationOut | None = None
    calories = base.calories
    clamped = base.clamped
    clamp_explanation = base.clamp_explanation

    if len(smoothed) >= 2:
        start_date, end_date = smoothed[0][0], smoothed[-1][0]
        days = (end_date - start_date).days
        if days > 0:
            daily_totals = _daily_totals_by_date(session, start_date, end_date)
            total_logged_calories = sum(t.get("energy_kcal", 0.0) for t in daily_totals.values())
            avg_logged_calories_per_day = total_logged_calories / days

            calibration = estimate_logging_bias(smoothed, avg_logged_calories_per_day, base.tdee)
            if calibration is not None:
                adjusted = apply_calibration(base.calories, calibration.logging_bias_factor, base.bmr, profile.sex)
                calories = adjusted.calories
                clamped = clamped or adjusted.clamped
                clamp_explanation = adjusted.explanation or clamp_explanation

                direction = "low" if calibration.bias_pct > 0 else "high"
                calibration_out = CalibrationOut(
                    logging_bias_factor=calibration.logging_bias_factor,
                    bias_pct=calibration.bias_pct,
                    days=calibration.days,
                    message=(
                        f"Your logs read about {abs(calibration.bias_pct):.0f}% {direction} compared with "
                        "your weight trend — targets adjusted."
                    ),
                )

    return TargetsOut(
        bmr=base.bmr,
        tdee=base.tdee,
        calories=calories,
        clamped=clamped,
        clamp_explanation=clamp_explanation,
        show_eating_disorder_resource=base.show_eating_disorder_resource,
        macros=_macros_out(base.macros),
        calibration=calibration_out,
    )


def compute_dashboard(session: Session, on_date: date) -> DashboardOut:
    profile = session.get(UserProfile, 1)

    daily_totals = _daily_totals_by_date(session, on_date, on_date).get(on_date, {})

    week_ago = on_date - timedelta(days=ROLLING_WINDOW_DAYS - 1)
    window_totals = _daily_totals_by_date(session, week_ago, on_date)

    earliest = _earliest_meal_date(session)
    days_of_history = (on_date - earliest).days + 1 if earliest else 1

    weekly_avg = rolling_average(
        window_totals, end_date=on_date, window_days=ROLLING_WINDOW_DAYS, days_of_history=days_of_history
    )

    targets_out = compute_calibrated_targets(session, profile, on_date) if profile is not None else None
    micronutrients = (
        [
            MicronutrientProgressOut(
                key=p.key, amount=p.amount, unit=p.unit, rda=p.rda, pct_rda=p.pct_rda, ul=p.ul, near_ul=p.near_ul
            )
            for p in compute_micronutrient_progress(daily_totals, profile.sex, profile.age_years)
        ]
        if profile is not None
        else []
    )

    return DashboardOut(
        date=on_date,
        daily=_to_daily_totals_out(daily_totals),
        weekly_avg=_to_daily_totals_out(weekly_avg),
        targets=targets_out,
        micronutrients=micronutrients,
    )
