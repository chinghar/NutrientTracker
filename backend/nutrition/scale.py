"""Scaling nutrient values from per-100g database rows to a logged portion,
and deriving display ranges from vision-estimate confidence."""

from __future__ import annotations


def scale_per_100g(amount: float, grams: float) -> float:
    return amount * grams / 100.0


def calorie_range(calories: float, confidence: float, max_deviation_pct: float = 0.3) -> tuple[float, float]:
    """A lower confidence widens the displayed range around the point
    estimate; confidence 1.0 collapses it to a single value. Never render a
    portion estimate as falsely precise."""
    confidence = max(0.0, min(1.0, confidence))
    deviation = calories * max_deviation_pct * (1 - confidence)
    return (max(calories - deviation, 0.0), calories + deviation)
