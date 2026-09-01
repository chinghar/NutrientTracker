"""Read-only lookups against the USDA/Open Food Facts tables built by the
Phase 1 ingest scripts (foods, nutrients, foods_fts, off_products). This
module never writes to those tables -- only backend/nutrition/dri.py-style
reference data changes, never the ingested schema itself.
"""

from __future__ import annotations

import sqlite3

from backend.nutrition.scale import scale_per_100g
from scripts.ingest_openfoodfacts import CANONICAL_COLUMNS
from scripts.ingest_usda import search_foods


def find_best_food_match(conn: sqlite3.Connection, query: str) -> sqlite3.Row | None:
    results = search_foods(conn, query, limit=1)
    return results[0] if results else None


def get_food_nutrients(conn: sqlite3.Connection, fdc_id: int, grams: float) -> dict[str, float]:
    rows = conn.execute("SELECT nutrient_key, amount FROM nutrients WHERE fdc_id = ?", (fdc_id,)).fetchall()
    return {key: scale_per_100g(amount, grams) for key, amount in rows}


def get_barcode_product(conn: sqlite3.Connection, barcode: str) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    return conn.execute("SELECT * FROM off_products WHERE barcode = ?", (barcode,)).fetchone()


def get_barcode_nutrients(conn: sqlite3.Connection, barcode: str, grams: float) -> dict[str, float] | None:
    row = get_barcode_product(conn, barcode)
    if row is None:
        return None
    return {
        col: scale_per_100g(row[col], grams)
        for col in CANONICAL_COLUMNS
        if row[col] is not None
    }
