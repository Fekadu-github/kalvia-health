from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import ProviderProfile, User, Role
from backend.auth.security import get_current_user, require_role
from backend import schemas

router = APIRouter()


@router.post("/providers/me", response_model=schemas.ProviderOut)
def create_my_provider_profile(
    payload: schemas.ProviderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    existing = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if existing:
        raise HTTPException(400, "Provider profile already exists for this user")

    profile = ProviderProfile(user_id=user.user_id, **payload.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/providers", response_model=List[schemas.ProviderOut])
def list_providers(
    specialty: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),  # any logged-in user can browse the directory
):
    query = db.query(ProviderProfile)
    if specialty:
        query = query.filter(ProviderProfile.specialty == specialty)
    return query.all()


@router.get("/providers/{provider_id}", response_model=schemas.ProviderOut)
def get_provider(
    provider_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.provider_id == provider_id).first()
    if not profile:
        raise HTTPException(404, "Provider not found")
    return profile
