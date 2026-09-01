from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db import init_db
from backend.routes import analyze, bodyweight, dashboard, foods, meals, profile, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Nutrition Tracker API", lifespan=lifespan)

# Local dev's Vite origin is always allowed; add the deployed frontend's
# origin(s) via CORS_ORIGINS (comma-separated) when running elsewhere.
_extra_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", *_extra_origins],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(foods.router)
app.include_router(meals.router)
app.include_router(settings.router)
app.include_router(profile.router)
app.include_router(bodyweight.router)
app.include_router(dashboard.router)
