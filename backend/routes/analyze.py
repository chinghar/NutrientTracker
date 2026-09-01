from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlmodel import Session

from backend.db import get_raw_connection, get_session
from backend.food_lookup import find_best_food_match, get_food_nutrients
from backend.models import AppSettings
from backend.nutrition.scale import calorie_range
from backend.schemas import AnalyzedItem, AnalyzeResponse
from backend.vision.base import VisionProvider, VisionProviderError
from backend.vision.factory import get_vision_provider

router = APIRouter()


def _build_hint(user_hint: str | None, settings: AppSettings | None) -> str | None:
    if settings and settings.plate_diameter_cm:
        plate_hint = (
            f"The user's plate is about {settings.plate_diameter_cm:.1f} cm in diameter; "
            "use it as a size reference for portion estimation."
        )
        return f"{user_hint}\n{plate_hint}" if user_hint else plate_hint
    return user_hint


@router.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_meal(
    image: UploadFile = File(...),
    hint: str | None = Form(None),
    session: Session = Depends(get_session),
    conn: sqlite3.Connection = Depends(get_raw_connection),
    provider: VisionProvider = Depends(get_vision_provider),
) -> AnalyzeResponse:
    image_bytes = await image.read()
    settings = session.get(AppSettings, 1)
    full_hint = _build_hint(hint, settings)

    try:
        analysis = provider.analyze(image_bytes, hint=full_hint)
    except VisionProviderError as e:
        return AnalyzeResponse(manual_entry_required=True, message=str(e))

    items: list[AnalyzedItem] = []
    for vi in analysis.items:
        match = find_best_food_match(conn, vi.usda_query)
        nutrients: dict[str, float] = {}
        calories = calories_low = calories_high = None
        fdc_id = None
        description = None
        if match is not None:
            fdc_id = match["fdc_id"]
            description = match["description"]
            nutrients = get_food_nutrients(conn, fdc_id, vi.estimated_grams)
            calories = nutrients.get("energy_kcal")
            if calories is not None:
                calories_low, calories_high = calorie_range(calories, vi.confidence)

        items.append(
            AnalyzedItem(
                name=vi.name,
                usda_query=vi.usda_query,
                estimated_grams=vi.estimated_grams,
                confidence=vi.confidence,
                reasoning=vi.reasoning,
                fdc_id=fdc_id,
                matched_description=description,
                nutrients=nutrients,
                calories=calories,
                calories_low=calories_low,
                calories_high=calories_high,
            )
        )

    return AnalyzeResponse(items=items)
