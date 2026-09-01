"""SQLModel tables owned by the app itself (as opposed to the Phase 1
ingest tables, which are plain sqlite3 and never touched by this module)."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LoggedMeal(SQLModel, table=True):
    __tablename__ = "logged_meals"

    id: int | None = Field(default=None, primary_key=True)
    logged_at: datetime = Field(default_factory=_utcnow)
    source: str  # "photo" | "barcode" | "manual" | "relog"
    relogged_from_id: int | None = Field(default=None, foreign_key="logged_meals.id")


class LoggedMealItem(SQLModel, table=True):
    __tablename__ = "logged_meal_items"

    id: int | None = Field(default=None, primary_key=True)
    meal_id: int = Field(foreign_key="logged_meals.id")
    name: str
    fdc_id: int | None = None
    off_barcode: str | None = None
    grams: float
    confidence: float | None = None
    nutrients_json: str  # JSON dict[str, float], already scaled to `grams`

    def nutrients(self) -> dict[str, float]:
        return json.loads(self.nutrients_json)


class AppSettings(SQLModel, table=True):
    __tablename__ = "app_settings"

    id: int | None = Field(default=1, primary_key=True)
    plate_diameter_cm: float | None = None


class UserProfile(SQLModel, table=True):
    """A single-user local app -- one profile row, id fixed at 1."""

    __tablename__ = "user_profile"

    id: int | None = Field(default=1, primary_key=True)
    weight_kg: float
    height_cm: float
    age_years: float
    sex: str  # "male" | "female"
    activity_level: str  # sedentary | light | moderate | heavy | athlete
    goal: str  # fat_loss | muscle_gain | maintenance
    body_fat_pct: float | None = None
    goal_weight_kg: float | None = None
    rate_pct: float | None = None
    updated_at: datetime = Field(default_factory=_utcnow)


class BodyWeightLog(SQLModel, table=True):
    __tablename__ = "body_weight_logs"

    id: int | None = Field(default=None, primary_key=True)
    log_date: date = Field(index=True)
    weight_kg: float
    logged_at: datetime = Field(default_factory=_utcnow)
