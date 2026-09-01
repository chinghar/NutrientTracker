from __future__ import annotations

import io

import pytest

from backend.vision.base import MealAnalysis, VisionProviderError
from tests.conftest import FIXTURE_MEAL_ITEM


def _dummy_image() -> tuple[str, io.BytesIO, str]:
    return "meal.png", io.BytesIO(b"not-a-real-image-but-bytes"), "image/png"


# --- Search / food / barcode lookups ---------------------------------------


def test_search_finds_chicken(client):
    resp = client.get("/api/search", params={"q": "chicken breast roasted"})
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) >= 1
    assert "Chicken" in results[0]["description"]


def test_food_detail_scales_nutrients(client):
    resp = client.get("/api/foods/1", params={"grams": 50})
    assert resp.status_code == 200
    body = resp.json()
    assert body["nutrients"]["energy_kcal"] == pytest.approx(82.5)
    assert body["nutrients"]["protein_g"] == pytest.approx(15.5)


def test_food_detail_404_for_unknown_fdc_id(client):
    resp = client.get("/api/foods/9999")
    assert resp.status_code == 404


def test_barcode_detail_found(client):
    resp = client.get("/api/barcode/012345678905", params={"grams": 50})
    assert resp.status_code == 200
    body = resp.json()
    assert body["product_name"] == "Instant Oatmeal"
    assert body["nutrients"]["energy_kcal"] == pytest.approx(185)


def test_barcode_detail_404_for_unknown_code(client):
    resp = client.get("/api/barcode/does-not-exist")
    assert resp.status_code == 404


# --- Settings ----------------------------------------------------------


def test_settings_default_is_none(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json()["plate_diameter_cm"] is None


def test_settings_put_then_get_roundtrips(client):
    resp = client.put("/api/settings", json={"plate_diameter_cm": 27.5})
    assert resp.status_code == 200
    assert resp.json()["plate_diameter_cm"] == pytest.approx(27.5)

    resp2 = client.get("/api/settings")
    assert resp2.json()["plate_diameter_cm"] == pytest.approx(27.5)


# --- Analyze -------------------------------------------------------------


def test_analyze_matches_food_and_computes_calorie_range(client, fixture_provider):
    fixture_provider.next_analysis = MealAnalysis(items=[FIXTURE_MEAL_ITEM])

    resp = client.post("/api/analyze", files={"image": _dummy_image()})
    assert resp.status_code == 200
    body = resp.json()
    assert body["manual_entry_required"] is False
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["fdc_id"] == 1
    assert item["calories"] is not None
    assert item["calories_low"] <= item["calories"] <= item["calories_high"]
    assert item["nutrients"]["protein_g"] > 0


def test_analyze_falls_back_to_manual_entry_on_provider_error(client, fixture_provider):
    fixture_provider.next_error = VisionProviderError("model unavailable")

    resp = client.post("/api/analyze", files={"image": _dummy_image()})
    assert resp.status_code == 200
    body = resp.json()
    assert body["manual_entry_required"] is True
    assert body["items"] == []
    assert "model unavailable" in body["message"]


def test_analyze_passes_plate_diameter_as_hint(client, fixture_provider):
    client.put("/api/settings", json={"plate_diameter_cm": 26.0})
    fixture_provider.next_analysis = MealAnalysis(items=[])

    client.post("/api/analyze", files={"image": _dummy_image()}, data={"hint": "extra context"})
    assert "26.0" in fixture_provider.last_hint
    assert "extra context" in fixture_provider.last_hint


def test_analyze_item_without_food_match_has_no_nutrients(client, fixture_provider):
    from backend.vision.base import MealItem

    unmatched = MealItem(
        name="mystery food", usda_query="zzz nonexistent gibberish", estimated_grams=100, confidence=0.5, reasoning="?"
    )
    fixture_provider.next_analysis = MealAnalysis(items=[unmatched])

    resp = client.post("/api/analyze", files={"image": _dummy_image()})
    item = resp.json()["items"][0]
    assert item["fdc_id"] is None
    assert item["nutrients"] == {}
    assert item["calories"] is None


# --- Meals: save, list, relog -----------------------------------------


def test_save_meal_computes_nutrients_server_side(client):
    payload = {
        "source": "manual",
        "items": [{"name": "Chicken breast", "fdc_id": 1, "grams": 150, "confidence": None}],
    }
    resp = client.post("/api/meals", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "manual"
    assert len(body["items"]) == 1
    assert body["items"][0]["nutrients"]["energy_kcal"] == pytest.approx(247.5)  # 165 * 1.5


def test_save_meal_from_barcode(client):
    payload = {
        "source": "barcode",
        "items": [{"name": "Instant Oatmeal", "off_barcode": "012345678905", "grams": 100, "confidence": None}],
    }
    resp = client.post("/api/meals", json=payload)
    body = resp.json()
    assert body["items"][0]["nutrients"]["energy_kcal"] == pytest.approx(370)


def test_list_meals_returns_saved_meal(client):
    client.post("/api/meals", json={"source": "manual", "items": [{"name": "x", "fdc_id": 1, "grams": 100}]})
    resp = client.get("/api/meals")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_relog_meal_copies_items_with_new_timestamp(client):
    original = client.post(
        "/api/meals", json={"source": "manual", "items": [{"name": "Chicken breast", "fdc_id": 1, "grams": 150}]}
    ).json()

    resp = client.post(f"/api/meals/{original['id']}/relog")
    assert resp.status_code == 200
    relogged = resp.json()
    assert relogged["source"] == "relog"
    assert relogged["relogged_from_id"] == original["id"]
    assert relogged["id"] != original["id"]
    assert relogged["items"][0]["name"] == "Chicken breast"
    assert relogged["items"][0]["nutrients"] == original["items"][0]["nutrients"]


def test_relog_nonexistent_meal_404s(client):
    resp = client.post("/api/meals/9999/relog")
    assert resp.status_code == 404
