from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from backend.dashboard_service import compute_calibrated_targets, compute_dashboard
from backend.db import get_session
from backend.models import UserProfile
from backend.schemas import DashboardOut, TargetsOut

router = APIRouter()


@router.get("/api/dashboard", response_model=DashboardOut)
def get_dashboard(on_date: date | None = Query(None, alias="date"), session: Session = Depends(get_session)) -> DashboardOut:
    return compute_dashboard(session, on_date or date.today())


@router.get("/api/targets", response_model=TargetsOut)
def get_targets(session: Session = Depends(get_session)) -> TargetsOut:
    profile = session.get(UserProfile, 1)
    if profile is None:
        raise HTTPException(status_code=404, detail="No profile set yet")
    return compute_calibrated_targets(session, profile, date.today())
