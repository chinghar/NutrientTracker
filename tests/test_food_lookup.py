from __future__ import annotations

import sqlite3

import pytest

from backend import food_lookup
from scripts import ingest_usda


@pytest.fixture
def conn_with_foods():
    conn = sqlite3.connect(":memory:")
    ingest_usda.create_schema(conn)
    conn.execute(
        "INSERT INTO foods (fdc_id, description, data_type) VALUES (1, 'Chicken, broilers or fryers, breast, meat only, roasted', 'sr_legacy_food')"
    )
    conn.execute(
        "INSERT INTO foods (fdc_id, description, data_type) VALUES (2, 'Rice, white, cooked', 'sr_legacy_food')"
    )
    conn.executemany(
        "INSERT INTO nutrients (fdc_id, nutrient_key, amount, unit) VALUES (?, ?, ?, ?)",
        [
            (1, "energy_kcal", 165, "kcal"),
            (1, "protein_g", 31, "g"),
            (1, "sodium_mg", 74, "mg"),
        ],
    )
    ingest_usda.populate_fts(conn)
    conn.commit()
    return conn


def test_find_best_food_match(conn_with_foods):
    match = food_lookup.find_best_food_match(conn_with_foods, "chicken breast roasted")
    assert match is not None
    assert "Chicken" in match["description"]


def test_find_best_food_match_returns_none_when_no_hit(conn_with_foods):
    match = food_lookup.find_best_food_match(conn_with_foods, "nonexistent gibberish food xyz")
    assert match is None


def test_get_food_nutrients_scales_by_grams(conn_with_foods):
    nutrients = food_lookup.get_food_nutrients(conn_with_foods, fdc_id=1, grams=50)
    assert nutrients["energy_kcal"] == pytest.approx(82.5)
    assert nutrients["protein_g"] == pytest.approx(15.5)
    assert nutrients["sodium_mg"] == pytest.approx(37)


def test_get_food_nutrients_empty_for_unknown_fdc_id(conn_with_foods):
    assert food_lookup.get_food_nutrients(conn_with_foods, fdc_id=999, grams=100) == {}


@pytest.fixture
def conn_with_barcode():
    conn = sqlite3.connect(":memory:")
    from scripts import ingest_openfoodfacts as off

    off.create_off_schema(conn)
    columns = ", ".join(["barcode", "product_name", "brands", "categories"] + off.CANONICAL_COLUMNS)
    placeholders = ", ".join(["?"] * (4 + len(off.CANONICAL_COLUMNS)))
    values = ["012345678905", "Instant Oatmeal", "Acme", "Breakfast cereals"] + [
        370 if col == "energy_kcal" else (13 if col == "protein_g" else None) for col in off.CANONICAL_COLUMNS
    ]
    conn.execute(f"INSERT INTO off_products ({columns}) VALUES ({placeholders})", values)
    conn.commit()
    return conn


def test_get_barcode_product_found(conn_with_barcode):
    product = food_lookup.get_barcode_product(conn_with_barcode, "012345678905")
    assert product is not None
    assert product["product_name"] == "Instant Oatmeal"


def test_get_barcode_product_not_found(conn_with_barcode):
    assert food_lookup.get_barcode_product(conn_with_barcode, "does-not-exist") is None


def test_get_barcode_nutrients_scales_and_skips_nulls(conn_with_barcode):
    nutrients = food_lookup.get_barcode_nutrients(conn_with_barcode, "012345678905", grams=50)
    assert nutrients is not None
    assert nutrients["energy_kcal"] == pytest.approx(185)
    assert nutrients["protein_g"] == pytest.approx(6.5)
    assert "sodium_mg" not in nutrients  # was None in the source row


def test_get_barcode_nutrients_none_when_barcode_unknown(conn_with_barcode):
    assert food_lookup.get_barcode_nutrients(conn_with_barcode, "does-not-exist", grams=100) is None
