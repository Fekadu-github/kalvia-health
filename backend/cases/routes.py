from typing import List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Case, CaseNote, PatientProfile, ProviderProfile, User, Role, PaymentType
from backend.auth.security import get_current_user, require_role
from backend.payments.rules import registration_active, find_unconsumed_approved, mark_activity
from backend import schemas

router = APIRouter()


def _get_or_create_patient_profile(db: Session, user: User) -> PatientProfile:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.user_id).first()
    if profile is None:
        profile = PatientProfile(user_id=user.user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.post("/cases", response_model=schemas.CaseOut)
def create_case(
    payload: schemas.CaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.patient)),
):
    """A patient opens a case with a chosen provider (e.g. after picking
    one from the directory). Gated behind two admin-approved payments:
    an active registration fee, and an unconsumed first_consultation
    payment — submit both via POST /payments and wait for admin
    approval (see backend/payments/routes.py) before this succeeds."""
    provider = db.query(ProviderProfile).filter(ProviderProfile.provider_id == payload.provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")

    patient_profile = _get_or_create_patient_profile(db, user)

    if not registration_active(db, patient_profile):
        raise HTTPException(
            402,
            "Registration fee required (or has lapsed after 90 days of inactivity). "
            "Submit a registration payment and wait for admin approval before opening a case.",
        )

    consultation_payment = find_unconsumed_approved(db, patient_profile.patient_id, PaymentType.first_consultation)
    if not consultation_payment:
        raise HTTPException(
            402,
            "First-consultation fee required. Submit a first_consultation payment and wait for "
            "admin approval before opening a case.",
        )

    case = Case(patient_id=patient_profile.patient_id, provider_id=provider.provider_id, reason=payload.reason)
    db.add(case)
    db.flush()  # assigns case.case_id before we link the payment to it

    consultation_payment.case_id = case.case_id
    consultation_payment.consumed_at = datetime.utcnow()
    mark_activity(db, patient_profile)

    db.commit()
    db.refresh(case)
    return case


@router.get("/cases", response_model=List[schemas.CaseOut])
def list_my_cases(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == Role.patient:
        patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.user_id).first()
        if not patient_profile:
            return []
        return db.query(Case).filter(Case.patient_id == patient_profile.patient_id).all()

    if user.role == Role.provider:
        provider_profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
        if not provider_profile:
            return []
        return db.query(Case).filter(Case.provider_id == provider_profile.provider_id).all()

    # admin / call_center_staff see everything for Phase 1 simplicity
    return db.query(Case).all()


@router.get("/cases/{case_id}/notes", response_model=List[schemas.CaseNoteOut])
def get_case_timeline(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    return db.query(CaseNote).filter(CaseNote.case_id == case_id).order_by(CaseNote.created_at).all()


@router.post("/cases/{case_id}/notes", response_model=schemas.CaseNoteOut)
def add_case_note(
    case_id: str,
    payload: schemas.CaseNoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")

    note = CaseNote(case_id=case_id, author_user_id=user.user_id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
