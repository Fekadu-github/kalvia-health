from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import PatientProfile, User, Role
from backend.auth.security import require_role
from backend.payments.rules import registration_active
from backend import schemas

router = APIRouter()

ALLOWED_ID_DOCUMENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_ID_DOCUMENT_BYTES = 8 * 1024 * 1024


def _get_or_create_patient_profile(db: Session, user: User) -> PatientProfile:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.user_id).first()
    if profile is None:
        profile = PatientProfile(user_id=user.user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("/patients/me", response_model=schemas.PatientMeOut)
def get_my_patient_status(db: Session = Depends(get_db), user: User = Depends(require_role(Role.patient))):
    """What the patient-facing UI needs to know about their own
    account: whether they still need to upload an ID, and whether
    their registration fee is currently valid (see
    backend/payments/rules.py for the 90-day lapse rule)."""
    profile = _get_or_create_patient_profile(db, user)
    return schemas.PatientMeOut(
        patient_id=profile.patient_id,
        has_id_document=profile.has_id_document,
        id_document_uploaded_at=profile.id_document_uploaded_at,
        registration_active=registration_active(db, profile),
    )


@router.put("/patients/me/id-document", response_model=schemas.PatientMeOut)
def upload_my_id_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.patient)),
):
    """Upload or replace the patient's national ID / passport. Optional
    at signup, but backend/appointments/routes.py requires it before
    an appointment can be booked. Accepts an image or a PDF scan.
    Stored as a DB blob, same reasoning as provider photos and
    payment proofs — no persistent disk on Render."""
    if file.content_type not in ALLOWED_ID_DOCUMENT_TYPES:
        raise HTTPException(400, "ID document must be a JPEG, PNG, WEBP image, or a PDF")

    raw = file.file.read()
    if len(raw) > MAX_ID_DOCUMENT_BYTES:
        raise HTTPException(400, "ID document must be under 8MB")

    profile = _get_or_create_patient_profile(db, user)
    profile.id_document_data = raw
    profile.id_document_content_type = file.content_type
    profile.id_document_filename = file.filename
    profile.id_document_uploaded_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)

    return schemas.PatientMeOut(
        patient_id=profile.patient_id,
        has_id_document=profile.has_id_document,
        id_document_uploaded_at=profile.id_document_uploaded_at,
        registration_active=registration_active(db, profile),
    )


@router.get("/patients/me/id-document")
def get_my_id_document(db: Session = Depends(get_db), user: User = Depends(require_role(Role.patient))):
    """Lets the patient view what they uploaded. Admins use the
    separate GET /admin/patients/{patient_id}/id-document in
    backend/payments/routes.py — never exposed unauthenticated."""
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.user_id).first()
    if not profile or not profile.id_document_data:
        raise HTTPException(404, "No ID document uploaded yet")
    return Response(
        content=profile.id_document_data,
        media_type=profile.id_document_content_type or "application/octet-stream",
    )
