"""Tests for the USDA and Open Food Facts ingest scripts.

These use small hand-written fixture CSVs that mirror the real USDA/OFF bulk
export schemas, rather than the real multi-gigabyte downloads, so the suite
stays fast and network-free. Run the real `python -m scripts.ingest_usda`
against the actual bulk data to validate at full scale.
"""

from __future__ import annotations

import csv
import gzip
import sqlite3
from pathlib import Path

import pytest

from scripts import ingest_openfoodfacts, ingest_usda


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


@pytest.fixture
def usda_fixture_dir(tmp_path: Path) -> Path:
    """A small USDA-schema-shaped dataset: two SR Legacy foods (one with a
    direct energy value) and one Foundation food that only has the Atwater
    fallback energy nutrient, to exercise the energy-fallback logic.
    """
    d = tmp_path / "dataset"
    d.mkdir()

    write_csv(
        d / "food_category.csv",
        ["id", "code", "description"],
        [{"id": "1", "code": "0500", "description": "Poultry Products"}],
    )

    write_csv(
        d / "nutrient.csv",
        ["id", "name", "unit_name", "nutrient_nbr"],
        [
            {"id": "1008", "name": "Energy", "unit_name": "KCAL", "nutrient_nbr": "208.0"},
            {"id": "2047", "name": "Energy (Atwater General Factor)", "unit_name": "KCAL", "nutrient_nbr": "957.0"},
            {"id": "1003", "name": "Protein", "unit_name": "G", "nutrient_nbr": "203.0"},
            {"id": "1004", "name": "Total lipid (fat)", "unit_name": "G", "nutrient_nbr": "204.0"},
            {"id": "1093", "name": "Sodium, Na", "unit_name": "MG", "nutrient_nbr": "307.0"},
        ],
    )

    write_csv(
        d / "food.csv",
        ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
        [
            {
                "fdc_id": "100001",
                "data_type": "sr_legacy_food",
                "description": "Chicken, broilers or fryers, breast, meat only, roasted",
                "food_category_id": "1",
                "publication_date": "2019-04-01",
            },
            {
                "fdc_id": "100002",
                "data_type": "sr_legacy_food",
                "description": "Rice, white, long-grain, cooked",
                "food_category_id": "",
                "publication_date": "2019-04-01",
            },
            {
                "fdc_id": "100003",
                "data_type": "foundation_food",
                "description": "Chicken, breast, raw (Foundation)",
                "food_category_id": "1",
                "publication_date": "2022-01-01",
            },
        ],
    )

    write_csv(
        d / "food_nutrient.csv",
        ["id", "fdc_id", "nutrient_id", "amount"],
        [
            {"id": "1", "fdc_id": "100001", "nutrient_id": "1008", "amount": "165"},
            {"id": "2", "fdc_id": "100001", "nutrient_id": "1003", "amount": "31"},
            {"id": "3", "fdc_id": "100001", "nutrient_id": "1004", "amount": "3.6"},
            {"id": "4", "fdc_id": "100001", "nutrient_id": "1093", "amount": "74"},
            {"id": "5", "fdc_id": "100002", "nutrient_id": "1008", "amount": "130"},
            {"id": "6", "fdc_id": "100002", "nutrient_id": "1003", "amount": "2.7"},
            # Foundation food: no direct 1008 (nutrient_nbr 208) row, only the
            # Atwater General Factor fallback (nutrient_nbr 957) -> id 2047.
            {"id": "7", "fdc_id": "100003", "nutrient_id": "2047", "amount": "120"},
            {"id": "8", "fdc_id": "100003", "nutrient_id": "1003", "amount": "22"},
        ],
    )

    return d


def test_normalize_nutrient_nbr():
    assert ingest_usda.normalize_nutrient_nbr("208.0") == "208"
    assert ingest_usda.normalize_nutrient_nbr(" 291 ") == "291"


def test_build_nutrient_maps(usda_fixture_dir: Path):
    nutrient_map, energy_fallback_id = ingest_usda.build_nutrient_maps(usda_fixture_dir / "nutrient.csv")
    assert nutrient_map[1008] == ("energy_kcal", "kcal")
    assert nutrient_map[1003] == ("protein_g", "g")
    assert nutrient_map[1093] == ("sodium_mg", "mg")
    assert 2047 not in nutrient_map  # fallback id is tracked separately
    assert energy_fallback_id == 2047


def test_load_foods_skips_internal_sample_tracking_rows(tmp_path: Path):
    """The Foundation Foods bulk download's food.csv mixes real foods
    (data_type='foundation_food') with internal lab sample-tracking rows
    (sample_food, sub_sample_food, market_acquisition, agricultural_acquisition)
    that outnumber real foods ~180:1 in practice. These must never end up
    in the searchable foods table.
    """
    d = tmp_path / "foundation_like"
    d.mkdir()
    write_csv(
        d / "food.csv",
        ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
        [
            {"fdc_id": "1", "data_type": "foundation_food", "description": "Tomatoes, grape, raw", "food_category_id": "", "publication_date": "2019-04-01"},
            {"fdc_id": "2", "data_type": "sample_food", "description": "TOMATOES, GRAPE", "food_category_id": "", "publication_date": "2019-04-01"},
            {"fdc_id": "3", "data_type": "sub_sample_food", "description": "TOMATOES, GRAPE", "food_category_id": "", "publication_date": "2019-04-01"},
            {"fdc_id": "4", "data_type": "market_acquisition", "description": "TOMATOES, GRAPE", "food_category_id": "", "publication_date": "2019-04-01"},
            {"fdc_id": "5", "data_type": "agricultural_acquisition", "description": "TOMATOES, GRAPE", "food_category_id": "", "publication_date": "2019-04-01"},
        ],
    )

    conn = sqlite3.connect(":memory:")
    ingest_usda.create_schema(conn)
    n_foods = ingest_usda.load_foods(conn, d / "food.csv", {})
    assert n_foods == 1

    rows = conn.execute("SELECT fdc_id, data_type FROM foods").fetchall()
    assert rows == [(1, "foundation_food")]


def test_load_foods_and_nutrients(usda_fixture_dir: Path):
    conn = sqlite3.connect(":memory:")
    ingest_usda.create_schema(conn)

    nutrient_map, energy_fallback_id = ingest_usda.build_nutrient_maps(usda_fixture_dir / "nutrient.csv")
    category_map = ingest_usda.load_food_category_map(usda_fixture_dir / "food_category.csv")

    n_foods = ingest_usda.load_foods(conn, usda_fixture_dir / "food.csv", category_map)
    assert n_foods == 3

    n_nutrients = ingest_usda.load_nutrients(
        conn, usda_fixture_dir / "food_nutrient.csv", nutrient_map, energy_fallback_id
    )
    assert n_nutrients == 8

    foods = {row[0]: row for row in conn.execute("SELECT fdc_id, description, food_category FROM foods")}
    assert foods[100001][1] == "Chicken, broilers or fryers, breast, meat only, roasted"
    assert foods[100001][2] == "Poultry Products"

    def get_amount(fdc_id: int, key: str) -> float:
        row = conn.execute(
            "SELECT amount FROM nutrients WHERE fdc_id = ? AND nutrient_key = ?", (fdc_id, key)
        ).fetchone()
        return row[0]

    assert get_amount(100001, "energy_kcal") == 165
    assert get_amount(100001, "protein_g") == 31
    assert get_amount(100001, "sodium_mg") == 74

    # Foundation food had no direct energy row (208) — must fall back to the
    # Atwater General Factor value (957) instead of being left empty.
    assert get_amount(100003, "energy_kcal") == 120
    assert get_amount(100003, "protein_g") == 22


def test_prune_orphan_nutrients_removes_rows_for_filtered_out_foods():
    conn = sqlite3.connect(":memory:")
    ingest_usda.create_schema(conn)
    conn.execute("INSERT INTO foods (fdc_id, description, data_type) VALUES (1, 'Real food', 'foundation_food')")
    conn.execute(
        "INSERT INTO nutrients (fdc_id, nutrient_key, amount, unit) VALUES (1, 'protein_g', 10, 'g')"
    )
    # Simulate a nutrient row left over from a sample-tracking fdc_id that
    # load_foods correctly excluded from the foods table.
    conn.execute(
        "INSERT INTO nutrients (fdc_id, nutrient_key, amount, unit) VALUES (999, 'protein_g', 5, 'g')"
    )
    conn.commit()

    n_pruned = ingest_usda.prune_orphan_nutrients(conn)
    assert n_pruned == 1
    remaining = conn.execute("SELECT fdc_id FROM nutrients").fetchall()
    assert remaining == [(1,)]


def test_search_finds_chicken_breast_roasted(usda_fixture_dir: Path):
    conn = sqlite3.connect(":memory:")
    ingest_usda.create_schema(conn)
    nutrient_map, energy_fallback_id = ingest_usda.build_nutrient_maps(usda_fixture_dir / "nutrient.csv")
    category_map = ingest_usda.load_food_category_map(usda_fixture_dir / "food_category.csv")
    ingest_usda.load_foods(conn, usda_fixture_dir / "food.csv", category_map)
    ingest_usda.load_nutrients(conn, usda_fixture_dir / "food_nutrient.csv", nutrient_map, energy_fallback_id)
    ingest_usda.populate_fts(conn)

    results = ingest_usda.search_foods(conn, "chicken breast roasted")
    assert len(results) >= 1
    top = results[0]
    assert "Chicken" in top["description"] and "roasted" in top["description"]

    nutrients = dict(
        conn.execute(
            "SELECT nutrient_key, amount FROM nutrients WHERE fdc_id = ?", (top["fdc_id"],)
        ).fetchall()
    )
    assert nutrients["energy_kcal"] > 0
    assert nutrients["protein_g"] > 0


def test_branded_details_update_foods(tmp_path: Path):
    d = tmp_path / "branded"
    d.mkdir()
    write_csv(
        d / "food.csv",
        ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
        [{"fdc_id": "200001", "data_type": "branded_food", "description": "Toasted Oats Cereal", "food_category_id": "", "publication_date": "2023-01-01"}],
    )
    write_csv(
        d / "branded_food.csv",
        ["fdc_id", "brand_owner", "gtin_upc", "serving_size", "serving_size_unit", "household_serving_fulltext"],
        [{"fdc_id": "200001", "brand_owner": "Acme Foods", "gtin_upc": "012345678905", "serving_size": "39", "serving_size_unit": "g", "household_serving_fulltext": "1 cup"}],
    )

    conn = sqlite3.connect(":memory:")
    ingest_usda.create_schema(conn)
    ingest_usda.load_foods(conn, d / "food.csv", {})
    n_updated = ingest_usda.load_branded_details(conn, d / "branded_food.csv")
    assert n_updated == 1

    row = conn.execute(
        "SELECT brand_owner, gtin_upc, serving_size, household_serving_fulltext FROM foods WHERE fdc_id = 200001"
    ).fetchone()
    assert row == ("Acme Foods", "012345678905", 39.0, "1 cup")


@pytest.fixture
def off_fixture_gz(tmp_path: Path) -> Path:
    gz_path = tmp_path / "products.csv.gz"
    fieldnames = [
        "code",
        "product_name",
        "brands",
        "categories",
        "energy-kcal_100g",
        "proteins_100g",
        "sodium_100g",
        "calcium_100g",
        "vitamin-c_100g",
    ]
    rows = [
        {
            "code": "0012345678905",
            "product_name": "Instant Oatmeal",
            "brands": "Acme",
            "categories": "Breakfast cereals",
            "energy-kcal_100g": "370",
            "proteins_100g": "13",
            "sodium_100g": "0.4",  # grams -> should convert to 400 mg
            "calcium_100g": "0.12",  # grams -> 120 mg
            "vitamin-c_100g": "",
        },
        {
            "code": "",  # no barcode -> must be skipped
            "product_name": "Unbarcoded sample",
            "brands": "",
            "categories": "",
            "energy-kcal_100g": "100",
            "proteins_100g": "1",
            "sodium_100g": "",
            "calcium_100g": "",
            "vitamin-c_100g": "",
        },
    ]
    with gzip.open(gz_path, "wt", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return gz_path


def test_off_ingest_converts_units_and_skips_missing_barcodes(off_fixture_gz: Path):
    conn = sqlite3.connect(":memory:")
    ingest_openfoodfacts.create_off_schema(conn)

    count = ingest_openfoodfacts.load_off_products(conn, off_fixture_gz)
    assert count == 1  # the barcode-less row was skipped

    row = ingest_openfoodfacts.lookup_barcode(conn, "0012345678905")
    assert row is not None
    assert row["product_name"] == "Instant Oatmeal"
    assert row["energy_kcal"] == 370
    assert row["protein_g"] == 13
    assert row["sodium_mg"] == pytest.approx(400)
    assert row["calcium_mg"] == pytest.approx(120)

    assert ingest_openfoodfacts.lookup_barcode(conn, "does-not-exist") is None


def test_off_ingest_is_idempotent_on_rerun(off_fixture_gz: Path):
    conn = sqlite3.connect(":memory:")
    ingest_openfoodfacts.create_off_schema(conn)
    ingest_openfoodfacts.load_off_products(conn, off_fixture_gz)
    ingest_openfoodfacts.load_off_products(conn, off_fixture_gz)  # re-run should upsert, not duplicate

    count = conn.execute("SELECT COUNT(*) FROM off_products").fetchone()[0]
    assert count == 1
