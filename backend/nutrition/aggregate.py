"""Pure aggregation math for the dashboard: summing per-meal nutrient
snapshots into daily/weekly totals, and comparing daily totals against DRI
targets. No I/O -- callers fetch logged-meal data and pass it in.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from backend.nutrition.dri import get_micronutrient_targets
from backend.nutrition.targets import Sex


def sum_nutrients(item_nutrient_dicts: list[dict[str, float]]) -> dict[str, float]:
    total: dict[str, float] = {}
    for nutrients in item_nutrient_dicts:
        for key, amount in nutrients.items():
            total[key] = total.get(key, 0.0) + amount
    return total


def rolling_average(
    daily_totals_by_date: dict[date, dict[str, float]],
    end_date: date,
    window_days: int = 7,
    days_of_history: int | None = None,
) -> dict[str, float]:
    """Average daily totals over the window_days ending at end_date
    (inclusive), using calendar days as the denominator -- a day with no
    logged meals counts as zero, not as excluded, so the average reflects
    true weekly intake rather than being inflated by sparse logging.

    If the app has been used for fewer than window_days days, average over
    just that many days instead (pass the real day count via
    days_of_history) so the figure isn't artificially deflated in the
    first week.
    """
    denominator = window_days if days_of_history is None else max(min(days_of_history, window_days), 1)

    keys: set[str] = set()
    for i in range(window_days):
        keys.update(daily_totals_by_date.get(end_date - timedelta(days=i), {}).keys())

    return {
        key: sum(daily_totals_by_date.get(end_date - timedelta(days=i), {}).get(key, 0.0) for i in range(window_days))
        / denominator
        for key in keys
    }


@dataclass(frozen=True)
class MicronutrientProgress:
    key: str
    amount: float
    unit: str
    rda: float
    pct_rda: float
    ul: float | None
    near_ul: bool


def compute_micronutrient_progress(
    daily_totals: dict[str, float],
    sex: Sex,
    age_years: float,
    near_ul_threshold: float = 0.9,
) -> list[MicronutrientProgress]:
    targets = get_micronutrient_targets(sex, age_years)
    progress = []
    for key, target in targets.items():
        amount = daily_totals.get(key, 0.0)
        pct_rda = (amount / target.rda * 100) if target.rda else 0.0
        near_ul = target.ul is not None and amount >= target.ul * near_ul_threshold
        progress.append(
            MicronutrientProgress(
                key=key, amount=amount, unit=target.unit, rda=target.rda, pct_rda=pct_rda, ul=target.ul, near_ul=near_ul
            )
        )
    return progress
