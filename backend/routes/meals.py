from __future__ import annotations

import json
import sqlite3
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from backend.db import get_raw_connection, get_session
from backend.food_lookup import get_barcode_nutrients, get_food_nutrients
from backend.models import LoggedMeal, LoggedMealItem
from backend.schemas import MealIn, MealItemOut, MealOut

router = APIRouter()


def _compute_item_nutrients(
    conn: sqlite3.Connection, fdc_id: int | None, off_barcode: str | None, grams: float
) -> dict[str, float]:
    if fdc_id is not None:
        return get_food_nutrients(conn, fdc_id, grams)
    if off_barcode is not None:
        return get_barcode_nutrients(conn, off_barcode, grams) or {}
    return {}


def _get_items(session: Session, meal_id: int) -> list[LoggedMealItem]:
    return list(session.exec(select(LoggedMealItem).where(LoggedMealItem.meal_id == meal_id)).all())


def _to_meal_out(session: Session, meal: LoggedMeal) -> MealOut:
    return MealOut(
        id=meal.id,
        logged_at=meal.logged_at,
        source=meal.source,
        relogged_from_id=meal.relogged_from_id,
        items=[
            MealItemOut(
                id=i.id,
                name=i.name,
                fdc_id=i.fdc_id,
                off_barcode=i.off_barcode,
                grams=i.grams,
                confidence=i.confidence,
                nutrients=i.nutrients(),
            )
            for i in _get_items(session, meal.id)
        ],
    )


@router.post("/api/meals", response_model=MealOut)
def save_meal(
    payload: MealIn,
    session: Session = Depends(get_session),
    conn: sqlite3.Connection = Depends(get_raw_connection),
) -> MealOut:
    meal = LoggedMeal(source=payload.source)
    session.add(meal)
    session.commit()
    session.refresh(meal)

    for item_in in payload.items:
        nutrients = _compute_item_nutrients(conn, item_in.fdc_id, item_in.off_barcode, item_in.grams)
        session.add(
            LoggedMealItem(
                meal_id=meal.id,
                name=item_in.name,
                fdc_id=item_in.fdc_id,
                off_barcode=item_in.off_barcode,
                grams=item_in.grams,
                confidence=item_in.confidence,
                nutrients_json=json.dumps(nutrients),
            )
        )
    session.commit()
    session.refresh(meal)
    return _to_meal_out(session, meal)


@router.get("/api/meals", response_model=list[MealOut])
def list_meals(on_date: date | None = Query(None, alias="date"), session: Session = Depends(get_session)) -> list[MealOut]:
    meals = session.exec(select(LoggedMeal)).all()
    if on_date is not None:
        meals = [m for m in meals if m.logged_at.date() == on_date]
    return [_to_meal_out(session, m) for m in meals]


@router.post("/api/meals/{meal_id}/relog", response_model=MealOut)
def relog_meal(meal_id: int, session: Session = Depends(get_session)) -> MealOut:
    original = session.get(LoggedMeal, meal_id)
    if original is None:
        raise HTTPException(status_code=404, detail="Meal not found")

    new_meal = LoggedMeal(source="relog", relogged_from_id=meal_id)
    session.add(new_meal)
    session.commit()
    session.refresh(new_meal)

    for item in _get_items(session, meal_id):
        session.add(
            LoggedMealItem(
                meal_id=new_meal.id,
                name=item.name,
                fdc_id=item.fdc_id,
                off_barcode=item.off_barcode,
                grams=item.grams,
                confidence=item.confidence,
                nutrients_json=item.nutrients_json,
            )
        )
    session.commit()
    session.refresh(new_meal)
    return _to_meal_out(session, new_meal)
