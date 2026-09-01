from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from backend.db import get_session
from backend.models import AppSettings
from backend.schemas import SettingsOut, SettingsUpdate

router = APIRouter()


@router.get("/api/settings", response_model=SettingsOut)
def get_settings(session: Session = Depends(get_session)) -> SettingsOut:
    settings = session.get(AppSettings, 1)
    if settings is None:
        return SettingsOut()
    return SettingsOut(plate_diameter_cm=settings.plate_diameter_cm)


@router.put("/api/settings", response_model=SettingsOut)
def update_settings(update: SettingsUpdate, session: Session = Depends(get_session)) -> SettingsOut:
    settings = session.get(AppSettings, 1)
    if settings is None:
        settings = AppSettings(id=1)
    settings.plate_diameter_cm = update.plate_diameter_cm
    session.add(settings)
    session.commit()
    return SettingsOut(plate_diameter_cm=settings.plate_diameter_cm)
