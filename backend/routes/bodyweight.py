from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from backend.db import get_session
from backend.models import BodyWeightLog
from backend.schemas import BodyWeightIn, BodyWeightOut

router = APIRouter()


@router.post("/api/bodyweight", response_model=BodyWeightOut)
def log_bodyweight(payload: BodyWeightIn, session: Session = Depends(get_session)) -> BodyWeightOut:
    log_date = payload.log_date or date.today()
    entry = BodyWeightLog(log_date=log_date, weight_kg=payload.weight_kg)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return BodyWeightOut(id=entry.id, log_date=entry.log_date, weight_kg=entry.weight_kg)


@router.get("/api/bodyweight", response_model=list[BodyWeightOut])
def list_bodyweight(session: Session = Depends(get_session)) -> list[BodyWeightOut]:
    entries = session.exec(select(BodyWeightLog).order_by(BodyWeightLog.log_date)).all()
    return [BodyWeightOut(id=e.id, log_date=e.log_date, weight_kg=e.weight_kg) for e in entries]
