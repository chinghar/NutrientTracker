"""Two separate storage layers, deliberately not unified:

1. The app's own writable tables (logged meals, settings, profile,
   bodyweight) -- a SQLModel engine. Locally this is SQLite at
   data/app.db. In production (DATABASE_URL set, e.g. Vercel Postgres),
   it's Postgres, since serverless deployments have no durable local disk
   for SQLite writes to survive between invocations.

2. The read-only USDA/Open Food Facts reference data (foods, nutrients,
   off_products) built by the Phase 1 ingest scripts -- always plain
   sqlite3, opened read-only. Locally this is the same data/app.db file
   (for developer convenience); in production it's a small pre-built
   SQLite file bundled into the deployment (see backend/data/), since it
   never needs writing at runtime and Vercel's deployed filesystem is
   read-only anyway.

Both paths are read lazily (not at import time) so tests can point them at
isolated temp files via env vars before anything is created.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

_engine = None
_BACKEND_DIR = Path(__file__).resolve().parent
_BUNDLED_FOOD_DB = _BACKEND_DIR / "data" / "food_reference.db"


def get_db_path() -> str:
    if "APP_DB_PATH" in os.environ:
        return os.environ["APP_DB_PATH"]
    if os.environ.get("VERCEL"):
        # DATABASE_URL wasn't set (get_engine() only reaches this path when
        # it's absent) and the deployment's own source tree is read-only, so
        # data/app.db isn't writable there. /tmp is the one writable
        # location on Vercel -- ephemeral per instance, so data logged this
        # way won't reliably persist, but at least the app boots and runs
        # instead of crashing at startup for a forgotten env var.
        return "/tmp/app.db"
    return "data/app.db"


def get_food_db_path() -> str:
    """Path to the read-only USDA/OFF reference database.

    FOOD_DB_PATH overrides explicitly if set. Otherwise: on Vercel, defaults
    to the bundled backend/data/food_reference.db shipped alongside this
    module (resolved via __file__ rather than a relative string, so it's
    correct regardless of the deployment's working directory) -- gated on
    VERCEL rather than DATABASE_URL, so food search/barcode lookup still
    work even if Postgres hasn't been connected yet. Local dev uses the same
    file as get_db_path().
    """
    override = os.environ.get("FOOD_DB_PATH")
    if override:
        return override
    if os.environ.get("VERCEL"):
        return str(_BUNDLED_FOOD_DB)
    return get_db_path()


def _normalize_database_url(url: str) -> str:
    # Managed Postgres providers commonly hand out `postgres://` or bare
    # `postgresql://` URLs, which SQLAlchemy resolves to psycopg2 by
    # default. Force the psycopg (v3) driver we actually depend on.
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def get_engine():
    global _engine
    if _engine is None:
        database_url = os.environ.get("DATABASE_URL")
        if database_url:
            _engine = create_engine(_normalize_database_url(database_url))
        else:
            _engine = create_engine(f"sqlite:///{get_db_path()}")
    return _engine


def init_db() -> None:
    if not os.environ.get("DATABASE_URL"):
        if os.environ.get("VERCEL"):
            print(
                "WARNING: DATABASE_URL is not set. Falling back to SQLite at "
                f"{get_db_path()}, which does not reliably persist between "
                "requests on Vercel. Connect a Postgres database and set "
                "DATABASE_URL for logged data to actually be saved."
            )
        Path(get_db_path()).parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(get_engine())


def get_session():
    with Session(get_engine()) as session:
        yield session


def get_raw_connection():
    path = get_food_db_path()
    # mode=ro: this file is never written at runtime, and production reads
    # it from a read-only deployment filesystem where a default read-write
    # open (which SQLite prepares for even for SELECT-only use) would fail.
    # check_same_thread=False: FastAPI dispatches this sync generator
    # dependency to a worker thread separate from an async route's event
    # loop thread; safe since each request gets its own connection.
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
    try:
        yield conn
    finally:
        conn.close()
