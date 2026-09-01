from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlmodel import Session

from backend.models import BodyWeightLog, LoggedMeal, LoggedMealItem

VALID_PROFILE = {
    "weight_kg": 80,
    "height_cm": 175,
    "age_years": 30,
    "sex": "male",
    "activity_level": "moderate",
    "goal": "fat_loss",
}


def _local_noon_as_naive_utc(day: date) -> datetime:
    """Mirrors how the app actually stores timestamps: naive values that are
    really UTC wall-clock (see backend/dashboard_service.py's comment on
    SQLite dropping tzinfo). Noon keeps the local date unambiguous across
    any real-world UTC offset when converted back for bucketing."""
    local_noon = datetime.combine(day, datetime.min.time().replace(hour=12)).astimezone()
    return local_noon.astimezone(timezone.utc).replace(tzinfo=None)


def _insert_meal(client, day: date, energy_kcal: float, protein_g: float = 20.0) -> None:
    """Insert a meal with a specific (backdated) logged_at -- the API always
    uses "now", so tests that need historical data go straight to the DB."""
    import json

    with Session(client.engine) as session:
        meal = LoggedMeal(logged_at=_local_noon_as_naive_utc(day), source="manual")
        session.add(meal)
        session.commit()
        session.refresh(meal)
        session.add(
            LoggedMealItem(
                meal_id=meal.id,
                name="Test food",
                grams=100,
                nutrients_json=json.dumps({"energy_kcal": energy_kcal, "protein_g": protein_g, "vitamin_c_mg": 30}),
            )
        )
        session.commit()


def _insert_weight(client, day: date, weight_kg: float) -> None:
    with Session(client.engine) as session:
        session.add(BodyWeightLog(log_date=day, weight_kg=weight_kg))
        session.commit()


# --- Profile -------------------------------------------------------------


def test_profile_get_returns_none_when_unset(client):
    resp = client.get("/api/profile")
    assert resp.status_code == 200
    assert resp.json() is None


def test_profile_put_then_get_roundtrips(client):
    resp = client.put("/api/profile", json=VALID_PROFILE)
    assert resp.status_code == 200
    assert resp.json()["weight_kg"] == 80

    resp2 = client.get("/api/profile")
    assert resp2.json()["goal"] == "fat_loss"


def test_profile_put_rejects_minor(client):
    payload = {**VALID_PROFILE, "age_years": 15}
    resp = client.put("/api/profile", json=payload)
    assert resp.status_code == 400


def test_profile_put_rejects_goal_weight_below_bmi_floor(client):
    payload = {**VALID_PROFILE, "goal_weight_kg": 40}  # BMI ~13 at 175cm
    resp = client.put("/api/profile", json=payload)
    assert resp.status_code == 400


# --- Targets -----------------------------------------------------------


def test_targets_404_without_profile(client):
    resp = client.get("/api/targets")
    assert resp.status_code == 404


def test_targets_computed_after_profile_set(client):
    client.put("/api/profile", json=VALID_PROFILE)
    resp = client.get("/api/targets")
    assert resp.status_code == 200
    body = resp.json()
    assert body["bmr"] > 0
    assert body["calories"] < body["tdee"]  # fat_loss goal
    assert body["calibration"] is None  # no bodyweight history yet


# --- Bodyweight ----------------------------------------------------------


def test_bodyweight_log_and_list(client):
    resp = client.post("/api/bodyweight", json={"weight_kg": 79.5, "log_date": "2026-01-01"})
    assert resp.status_code == 200
    resp2 = client.post("/api/bodyweight", json={"weight_kg": 79.0, "log_date": "2026-01-02"})
    assert resp2.status_code == 200

    listing = client.get("/api/bodyweight").json()
    assert len(listing) == 2
    assert listing[0]["log_date"] == "2026-01-01"


def test_bodyweight_defaults_to_today(client):
    resp = client.post("/api/bodyweight", json={"weight_kg": 80})
    assert resp.json()["log_date"] == date.today().isoformat()


# --- Dashboard: empty state ----------------------------------------------


def test_dashboard_empty_state_has_no_targets_or_micronutrients(client):
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["daily"]["calories"] == 0
    assert body["targets"] is None
    assert body["micronutrients"] == []


# --- Dashboard: daily totals from logged meals --------------------------


def test_dashboard_daily_totals_reflect_saved_meal(client):
    today = date.today()
    payload = {
        "source": "manual",
        "items": [{"name": "Snack", "fdc_id": None, "grams": 100, "confidence": None}],
    }
    # save_meal computes nutrients via fdc_id/barcode join; use a direct
    # insert instead since this test only cares about dashboard aggregation.
    _insert_meal(client, today, energy_kcal=500, protein_g=30)

    resp = client.get(f"/api/dashboard?date={today.isoformat()}")
    body = resp.json()
    assert body["daily"]["calories"] == pytest.approx(500)
    assert body["daily"]["protein_g"] == pytest.approx(30)


def test_dashboard_micronutrient_progress_reflects_logged_food(client):
    client.put("/api/profile", json=VALID_PROFILE)
    today = date.today()
    _insert_meal(client, today, energy_kcal=500)  # includes vitamin_c_mg: 30 per _insert_meal

    resp = client.get(f"/api/dashboard?date={today.isoformat()}")
    body = resp.json()
    vit_c = next(m for m in body["micronutrients"] if m["key"] == "vitamin_c_mg")
    assert vit_c["amount"] == pytest.approx(30)
    assert vit_c["pct_rda"] == pytest.approx(30 / 90 * 100)  # male RDA is 90mg


def test_dashboard_weekly_average_spans_multiple_days(client):
    today = date.today()
    _insert_meal(client, today, energy_kcal=2000)
    _insert_meal(client, today - timedelta(days=1), energy_kcal=1000)
    # 5 other days in the window have no logged meals -> count as zero

    resp = client.get(f"/api/dashboard?date={today.isoformat()}")
    body = resp.json()
    # days_of_history = 2 (earliest meal is yesterday), so avg is over 2 days
    assert body["weekly_avg"]["calories"] == pytest.approx((2000 + 1000) / 2)


# --- Dashboard: calibration end-to-end ------------------------------------


def test_targets_includes_calibration_after_14_days_of_consistent_underlogging(client):
    client.put("/api/profile", json=VALID_PROFILE)
    tdee = client.get("/api/targets").json()["tdee"]

    start = date.today() - timedelta(days=20)
    # Log a plausible-looking deficit (2000 kcal/day) but actually gain
    # weight over the period -- implies the logs are reading low.
    for i in range(21):
        _insert_meal(client, start + timedelta(days=i), energy_kcal=2000)
    _insert_weight(client, start, 80.0)
    _insert_weight(client, start + timedelta(days=20), 80.5)

    resp = client.get("/api/targets")
    body = resp.json()
    assert body["calibration"] is not None
    assert body["calibration"]["logging_bias_factor"] < 1.0
    assert "low" in body["calibration"]["message"]
    assert body["calories"] < tdee  # still a deficit target after calibration


def test_targets_calibration_never_pushes_below_floor(client):
    payload = {**VALID_PROFILE, "weight_kg": 45, "height_cm": 150, "sex": "female", "age_years": 20}
    client.put("/api/profile", json=payload)

    start = date.today() - timedelta(days=20)
    for i in range(21):
        _insert_meal(client, start + timedelta(days=i), energy_kcal=1400)
    _insert_weight(client, start, 45.0)
    _insert_weight(client, start + timedelta(days=20), 47.0)  # large unexplained gain -> extreme bias

    resp = client.get("/api/targets")
    body = resp.json()
    assert body["calories"] >= 1200  # female floor
    if body["calibration"] is not None and body["calibration"]["logging_bias_factor"] < 1.0:
        assert body["clamped"] is True
