from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from backend.db import get_raw_connection, get_session
from backend.main import app
from backend.vision.base import MealAnalysis, MealItem, VisionProvider
from scripts import ingest_usda


class FixtureVisionProvider(VisionProvider):
    """A VisionProvider test double whose response is set per-test."""

    def __init__(self):
        self.next_analysis: MealAnalysis = MealAnalysis(items=[])
        self.next_error: Exception | None = None
        self.last_hint: str | None = None

    def analyze(self, image_bytes: bytes, hint: str | None = None) -> MealAnalysis:
        self.last_hint = hint
        if self.next_error is not None:
            raise self.next_error
        return self.next_analysis


@pytest.fixture
def fixture_provider():
    return FixtureVisionProvider()


@pytest.fixture
def client(tmp_path, fixture_provider):
    db_path = tmp_path / "test_app.db"
    engine = create_engine(f"sqlite:///{db_path}")
    SQLModel.metadata.create_all(engine)

    raw_conn = sqlite3.connect(db_path)
    ingest_usda.create_schema(raw_conn)
    raw_conn.execute(
        "INSERT INTO foods (fdc_id, description, data_type) VALUES "
        "(1, 'Chicken, broilers or fryers, breast, meat only, roasted', 'sr_legacy_food')"
    )
    raw_conn.executemany(
        "INSERT INTO nutrients (fdc_id, nutrient_key, amount, unit) VALUES (?, ?, ?, ?)",
        [
            (1, "energy_kcal", 165, "kcal"),
            (1, "protein_g", 31, "g"),
            (1, "sodium_mg", 74, "mg"),
        ],
    )
    ingest_usda.populate_fts(raw_conn)

    from scripts import ingest_openfoodfacts as off

    off.create_off_schema(raw_conn)
    columns = ", ".join(["barcode", "product_name", "brands", "categories"] + off.CANONICAL_COLUMNS)
    placeholders = ", ".join(["?"] * (4 + len(off.CANONICAL_COLUMNS)))
    values = ["012345678905", "Instant Oatmeal", "Acme", "Breakfast cereals"] + [
        370 if col == "energy_kcal" else (13 if col == "protein_g" else None) for col in off.CANONICAL_COLUMNS
    ]
    raw_conn.execute(f"INSERT INTO off_products ({columns}) VALUES ({placeholders})", values)
    raw_conn.commit()
    raw_conn.close()

    def override_get_session():
        with Session(engine) as session:
            yield session

    def override_get_raw_connection():
        conn = sqlite3.connect(db_path, check_same_thread=False)
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_raw_connection] = override_get_raw_connection

    from backend.vision.factory import get_vision_provider

    app.dependency_overrides[get_vision_provider] = lambda: fixture_provider

    with TestClient(app) as test_client:
        test_client.db_path = str(db_path)  # for tests that need to insert backdated rows directly
        test_client.engine = engine
        yield test_client

    app.dependency_overrides.clear()


FIXTURE_MEAL_ITEM = MealItem(
    name="grilled chicken breast",
    usda_query="chicken breast roasted",
    estimated_grams=150,
    confidence=0.8,
    reasoning="palm-sized portion",
)
