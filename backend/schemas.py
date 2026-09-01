"""Pydantic request/response models for the HTTP API. Distinct from
backend/vision/base.py's MealAnalysis, which is the vision-provider contract."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class AnalyzedItem(BaseModel):
    name: str
    usda_query: str
    estimated_grams: float
    confidence: float
    reasoning: str
    fdc_id: int | None = None
    matched_description: str | None = None
    nutrients: dict[str, float] = {}
    calories: float | None = None
    calories_low: float | None = None
    calories_high: float | None = None


class AnalyzeResponse(BaseModel):
    items: list[AnalyzedItem] = []
    manual_entry_required: bool = False
    message: str | None = None


class FoodSearchResult(BaseModel):
    fdc_id: int
    description: str
    data_type: str
    food_category: str | None = None


class FoodDetail(BaseModel):
    fdc_id: int
    description: str
    grams: float
    nutrients: dict[str, float]


class BarcodeDetail(BaseModel):
    barcode: str
    product_name: str | None
    brands: str | None
    grams: float
    nutrients: dict[str, float]


class SettingsOut(BaseModel):
    plate_diameter_cm: float | None = None


class SettingsUpdate(BaseModel):
    plate_diameter_cm: float | None = None


class MealItemIn(BaseModel):
    name: str
    fdc_id: int | None = None
    off_barcode: str | None = None
    grams: float
    confidence: float | None = None


class MealIn(BaseModel):
    source: str  # "photo" | "barcode" | "manual"
    items: list[MealItemIn]


class MealItemOut(BaseModel):
    id: int
    name: str
    fdc_id: int | None
    off_barcode: str | None
    grams: float
    confidence: float | None
    nutrients: dict[str, float]


class MealOut(BaseModel):
    id: int
    logged_at: datetime
    source: str
    relogged_from_id: int | None
    items: list[MealItemOut]


class ProfileIn(BaseModel):
    weight_kg: float
    height_cm: float
    age_years: float
    sex: str
    activity_level: str
    goal: str
    body_fat_pct: float | None = None
    goal_weight_kg: float | None = None
    rate_pct: float | None = None


class ProfileOut(ProfileIn):
    updated_at: datetime


class MacrosOut(BaseModel):
    protein_g: float
    fat_g: float
    carb_g: float
    fiber_g: float


class CalibrationOut(BaseModel):
    logging_bias_factor: float
    bias_pct: float
    days: int
    message: str


class TargetsOut(BaseModel):
    bmr: float
    tdee: float
    calories: float
    clamped: bool
    clamp_explanation: str | None
    show_eating_disorder_resource: bool
    macros: MacrosOut
    calibration: CalibrationOut | None = None


class BodyWeightIn(BaseModel):
    weight_kg: float
    log_date: date | None = None


class BodyWeightOut(BaseModel):
    id: int
    log_date: date
    weight_kg: float


class MicronutrientProgressOut(BaseModel):
    key: str
    amount: float
    unit: str
    rda: float
    pct_rda: float
    ul: float | None
    near_ul: bool


class DailyTotalsOut(BaseModel):
    calories: float
    protein_g: float
    fat_g: float
    carbohydrate_g: float
    fiber_g: float


class DashboardOut(BaseModel):
    date: date
    daily: DailyTotalsOut
    weekly_avg: DailyTotalsOut
    targets: TargetsOut | None
    micronutrients: list[MicronutrientProgressOut]
