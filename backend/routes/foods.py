from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.db import get_raw_connection
from backend.food_lookup import get_barcode_nutrients, get_barcode_product, get_food_nutrients
from backend.schemas import BarcodeDetail, FoodDetail, FoodSearchResult
from scripts.ingest_usda import search_foods

router = APIRouter()


@router.get("/api/search", response_model=list[FoodSearchResult])
def search(q: str = Query(min_length=1), limit: int = 10, conn: sqlite3.Connection = Depends(get_raw_connection)):
    rows = search_foods(conn, q, limit=limit)
    return [
        FoodSearchResult(
            fdc_id=r["fdc_id"], description=r["description"], data_type=r["data_type"], food_category=r["food_category"]
        )
        for r in rows
    ]


@router.get("/api/foods/{fdc_id}", response_model=FoodDetail)
def food_detail(fdc_id: int, grams: float = 100, conn: sqlite3.Connection = Depends(get_raw_connection)):
    row = conn.execute("SELECT description FROM foods WHERE fdc_id = ?", (fdc_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Food not found")
    nutrients = get_food_nutrients(conn, fdc_id, grams)
    return FoodDetail(fdc_id=fdc_id, description=row[0], grams=grams, nutrients=nutrients)


@router.get("/api/barcode/{code}", response_model=BarcodeDetail)
def barcode_detail(code: str, grams: float = 100, conn: sqlite3.Connection = Depends(get_raw_connection)):
    product = get_barcode_product(conn, code)
    if product is None:
        raise HTTPException(status_code=404, detail="Barcode not found")
    nutrients = get_barcode_nutrients(conn, code, grams) or {}
    return BarcodeDetail(
        barcode=code, product_name=product["product_name"], brands=product["brands"], grams=grams, nutrients=nutrients
    )
