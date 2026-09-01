"""SQLModel engine for the app's own tables (logged meals, settings), plus
a raw sqlite3 connection dependency for querying the Phase 1 ingest tables
(foods, nutrients, off_products) via backend/food_lookup.py. Both point at
the same data/app.db file, which SQLite allows.

DB_PATH is read lazily (not at import time) so tests can point it at an
isolated temp file via the APP_DB_PATH env var before the engine is created.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

_engine = None


def get_db_path() -> str:
    return os.environ.get("APP_DB_PATH", "data/app.db")


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(f"sqlite:///{get_db_path()}")
    return _engine


def init_db() -> None:
    Path(get_db_path()).parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine()) as session:
        yield session


def get_raw_connection():
    # check_same_thread=False: FastAPI dispatches this sync generator
    # dependency to a worker thread separate from an async route's event
    # loop thread. Safe here since each request gets its own connection --
    # never shared across concurrent threads.
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()
