from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from backend.db import get_session
from backend.models import UserProfile
from backend.nutrition.targets import BMIFloorError, MinorAgeError, compute_targets
from backend.schemas import ProfileIn, ProfileOut

router = APIRouter()


def _validate(profile_in: ProfileIn) -> None:
    """Reject the same inputs the targets engine would reject, so bad
    profiles never get persisted in the first place."""
    try:
        compute_targets(
            weight_kg=profile_in.weight_kg,
            height_cm=profile_in.height_cm,
            age_years=profile_in.age_years,
            sex=profile_in.sex,
            activity_level=profile_in.activity_level,
            goal=profile_in.goal,
            body_fat_pct=profile_in.body_fat_pct,
            rate_pct=profile_in.rate_pct,
            goal_weight_kg=profile_in.goal_weight_kg,
        )
    except (MinorAgeError, BMIFloorError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/api/profile", response_model=ProfileOut | None)
def get_profile(session: Session = Depends(get_session)) -> ProfileOut | None:
    profile = session.get(UserProfile, 1)
    if profile is None:
        return None
    return ProfileOut(**profile.model_dump())


@router.put("/api/profile", response_model=ProfileOut)
def update_profile(profile_in: ProfileIn, session: Session = Depends(get_session)) -> ProfileOut:
    _validate(profile_in)

    profile = session.get(UserProfile, 1)
    if profile is None:
        profile = UserProfile(id=1, **profile_in.model_dump())
    else:
        for key, value in profile_in.model_dump().items():
            setattr(profile, key, value)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return ProfileOut(**profile.model_dump())
