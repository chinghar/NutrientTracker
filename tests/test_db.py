from __future__ import annotations

import sqlite3

import pytest

from backend import db


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("postgres://user:pw@host/db", "postgresql+psycopg://user:pw@host/db"),
        ("postgresql://user:pw@host/db", "postgresql+psycopg://user:pw@host/db"),
        ("postgresql+psycopg://user:pw@host/db", "postgresql+psycopg://user:pw@host/db"),
        ("postgresql+psycopg2://user:pw@host/db", "postgresql+psycopg2://user:pw@host/db"),
    ],
)
def test_normalize_database_url(raw, expected):
    assert db._normalize_database_url(raw) == expected


def test_get_food_db_path_defaults_to_app_db_path_locally(monkeypatch):
    monkeypatch.delenv("FOOD_DB_PATH", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setenv("APP_DB_PATH", "/some/path/app.db")
    assert db.get_food_db_path() == "/some/path/app.db"


def test_get_food_db_path_defaults_to_bundled_file_on_vercel(monkeypatch):
    # Gated on VERCEL, not DATABASE_URL -- food search/barcode lookup must
    # still work even if Postgres hasn't been connected yet.
    monkeypatch.delenv("FOOD_DB_PATH", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    assert db.get_food_db_path() == str(db._BUNDLED_FOOD_DB)
    assert db._BUNDLED_FOOD_DB.name == "food_reference.db"


def test_get_food_db_path_override(monkeypatch):
    monkeypatch.setenv("FOOD_DB_PATH", "/bundled/food_reference.db")
    assert db.get_food_db_path() == "/bundled/food_reference.db"


# --- get_db_path: forgetting DATABASE_URL on Vercel must not crash the app --


def test_get_db_path_local_dev_default(monkeypatch):
    monkeypatch.delenv("APP_DB_PATH", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert db.get_db_path() == "data/app.db"


def test_get_db_path_falls_back_to_tmp_on_vercel_without_database_url(monkeypatch):
    # data/app.db isn't writable on Vercel's read-only deployment filesystem
    # -- without this fallback, forgetting to set DATABASE_URL would crash
    # the whole app at startup (SQLModel.metadata.create_all failing to
    # create the file) rather than just losing persistence.
    monkeypatch.delenv("APP_DB_PATH", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    assert db.get_db_path() == "/tmp/app.db"


def test_get_db_path_explicit_override_wins_even_on_vercel(monkeypatch):
    monkeypatch.setenv("APP_DB_PATH", "/custom/path.db")
    monkeypatch.setenv("VERCEL", "1")
    assert db.get_db_path() == "/custom/path.db"


def test_get_raw_connection_opens_read_only(tmp_path, monkeypatch):
    db_path = tmp_path / "reference.db"
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE foods (fdc_id INTEGER PRIMARY KEY, description TEXT)")
    conn.execute("INSERT INTO foods VALUES (1, 'Test Food')")
    conn.commit()
    conn.close()

    monkeypatch.setenv("FOOD_DB_PATH", str(db_path))
    gen = db.get_raw_connection()
    ro_conn = next(gen)
    try:
        row = ro_conn.execute("SELECT description FROM foods WHERE fdc_id = 1").fetchone()
        assert row[0] == "Test Food"

        with pytest.raises(sqlite3.OperationalError):
            ro_conn.execute("INSERT INTO foods VALUES (2, 'Should fail')")
    finally:
        gen.close()  # runs the generator's finally: block, closing ro_conn


def test_get_raw_connection_missing_file_raises(tmp_path, monkeypatch):
    monkeypatch.setenv("FOOD_DB_PATH", str(tmp_path / "does_not_exist.db"))
    gen = db.get_raw_connection()
    with pytest.raises(sqlite3.OperationalError):
        next(gen)
