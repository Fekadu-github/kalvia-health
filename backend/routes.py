import io
import uuid
from datetime import datetime
from typing import Optional, List, Union

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import (
    ProviderProfile,
    ProviderApprovalStatus,
    User,
    Role,
)
from backend.auth.security import get_current_user, require_role
from backend import schemas

router = APIRouter()

# 3:4 portrait, matching a standard passport/ID-style photo crop.
PHOTO_WIDTH = 450
PHOTO_HEIGHT = 600
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _reset_for_review(profile: ProviderProfile) -> None:
    """Any create or edit by the provider drops the profile back to
    'pending' so an admin has to sign off before patients see it."""
    profile.approval_status = ProviderApprovalStatus.pending
    profile.rejection_reason = None
    profile.approved_at = None
    profile.approved_by_user_id = None


def _crop_to_3x4(image: Image.Image) -> Image.Image:
    """Center-crop to a 3:4 (width:height) portrait ratio, then
    resize to a fixed size so every stored photo is uniform."""
    image = image.convert("RGB")
    width, height = image.size
    target_ratio = PHOTO_WIDTH / PHOTO_HEIGHT

    current_ratio = width / height
    if current_ratio > target_ratio:
        # too wide — crop the sides
        new_width = int(height * target_ratio)
        left = (width - new_width) // 2
        image = image.crop((left, 0, left + new_width, height))
    elif current_ratio < target_ratio:
        # too tall — crop top/bottom
        new_height = int(width / target_ratio)
        top = (height - new_height) // 2
        image = image.crop((0, top, width, top + new_height))

    return image.resize((PHOTO_WIDTH, PHOTO_HEIGHT), Image.LANCZOS)


@router.post("/providers/me", response_model=schemas.ProviderOut)
def create_my_provider_profile(
    payload: schemas.ProviderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    existing = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if existing:
        raise HTTPException(400, "Provider profile already exists for this user — use PATCH /providers/me to edit it")

    profile = ProviderProfile(user_id=user.user_id, **payload.model_dump())
    profile.approval_status = ProviderApprovalStatus.pending
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/providers/me", response_model=schemas.ProviderOut)
def get_my_provider_profile(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if not profile:
        raise HTTPException(404, "No provider profile yet — create one first")
    return profile


@router.patch("/providers/me", response_model=schemas.ProviderOut)
def update_my_provider_profile(
    payload: schemas.ProviderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    """Providers can edit their own profile whenever they need to.
    Any change resubmits it for admin approval — the directory only
    ever lists approved profiles, so an edited profile drops out of
    patient view until an admin reviews it again."""
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if not profile:
        raise HTTPException(404, "No provider profile yet — create one first")

    updates = payload.model_dump(exclude_unset=True)
    if "accepting_new_cases" in updates:
        updates["accepting_new_cases"] = "true" if updates.pop("accepting_new_cases") else "false"

    for field, value in updates.items():
        setattr(profile, field, value)

    if updates:
        _reset_for_review(profile)

    db.commit()
    db.refresh(profile)
    return profile


@router.put("/providers/me/photo", response_model=schemas.ProviderOut)
def upload_my_provider_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    """Upload or replace the provider's profile photo. Auto-cropped to
    a 3:4 portrait server-side, so any image works as input. Unlike
    the rest of the profile, a new photo takes effect immediately —
    no admin re-approval needed — so it can be changed anytime."""
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if not profile:
        raise HTTPException(404, "No provider profile yet — create one first")

    if file.content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(400, "Photo must be a JPEG, PNG, or WEBP image")

    raw = file.file.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(400, "Photo must be under 8MB")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except UnidentifiedImageError:
        raise HTTPException(400, "Could not read that file as an image")

    cropped = _crop_to_3x4(image)

    buffer = io.BytesIO()
    cropped.save(buffer, format="JPEG", quality=90)

    # Stored in the DB rather than on disk: Render's free tier has no
    # persistent disk, so anything written to the filesystem is lost
    # on the next redeploy. Replacing the row replaces the photo, so
    # there is no orphaned-file cleanup to do.
    profile.photo_data = buffer.getvalue()
    profile.photo_version = uuid.uuid4().hex[:10]
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/providers/{provider_id}/photo")
def get_provider_photo(
    provider_id: str,
    db: Session = Depends(get_db),
):
    """Streams the stored JPEG. Deliberately unauthenticated: the
    frontend renders this straight into an <img src>, which cannot
    send an Authorization header. The URL is unguessable (random
    provider_id plus a random ?v= token) and a provider photo is
    shown to every patient in the directory anyway, so there is no
    private data behind it."""
    profile = db.query(ProviderProfile).filter(ProviderProfile.provider_id == provider_id).first()
    if not profile or not profile.photo_data:
        raise HTTPException(404, "No photo for this provider")

    return Response(
        content=profile.photo_data,
        media_type="image/jpeg",
        # The URL carries a ?v= token that changes on every upload,
        # so this can be cached hard without ever going stale.
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.delete("/providers/me/photo", response_model=schemas.ProviderOut)
def delete_my_provider_photo(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if not profile:
        raise HTTPException(404, "No provider profile yet — create one first")

    profile.photo_data = None
    profile.photo_version = None
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/providers", response_model=List[Union[schemas.ProviderOut, schemas.ProviderPublicOut]])
def list_providers(
    specialty: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(ProviderProfile)
    if specialty:
        query = query.filter(ProviderProfile.specialty == specialty)

    if user.role == Role.patient:
        # Patients only ever browse approved profiles, and never see
        # license numbers or the review workflow fields.
        providers = query.filter(ProviderProfile.approval_status == ProviderApprovalStatus.approved).all()
        return [schemas.ProviderPublicOut.model_validate(p) for p in providers]

    # admin / provider / call_center_staff see the full picture, including pending/rejected.
    providers = query.all()
    return [schemas.ProviderOut.model_validate(p) for p in providers]


@router.get("/providers/{provider_id}", response_model=Union[schemas.ProviderOut, schemas.ProviderPublicOut])
def get_provider(
    provider_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.provider_id == provider_id).first()
    if not profile:
        raise HTTPException(404, "Provider not found")

    if user.role == Role.patient:
        if profile.approval_status != ProviderApprovalStatus.approved:
            # Don't reveal that a pending/rejected provider exists.
            raise HTTPException(404, "Provider not found")
        return schemas.ProviderPublicOut.model_validate(profile)

    return schemas.ProviderOut.model_validate(profile)


@router.post("/providers/{provider_id}/approve", response_model=schemas.ProviderOut)
def approve_provider(
    provider_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(Role.admin)),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.provider_id == provider_id).first()
    if not profile:
        raise HTTPException(404, "Provider not found")

    profile.approval_status = ProviderApprovalStatus.approved
    profile.rejection_reason = None
    profile.approved_at = datetime.utcnow()
    profile.approved_by_user_id = admin.user_id
    db.commit()
    db.refresh(profile)
    return profile


@router.post("/providers/{provider_id}/reject", response_model=schemas.ProviderOut)
def reject_provider(
    provider_id: str,
    payload: schemas.ProviderRejectRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(Role.admin)),
):
    profile = db.query(ProviderProfile).filter(ProviderProfile.provider_id == provider_id).first()
    if not profile:
        raise HTTPException(404, "Provider not found")

    profile.approval_status = ProviderApprovalStatus.rejected
    profile.rejection_reason = payload.rejection_reason
    profile.approved_at = None
    profile.approved_by_user_id = admin.user_id
    db.commit()
    db.refresh(profile)
    return profile
