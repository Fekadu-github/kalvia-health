from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Case, CaseNote, PatientProfile, ProviderProfile, User, Role
from backend.auth.security import get_current_user, require_role
from backend.access import get_case_or_404, assert_case_participant
from backend.cases.numbering import next_case_number
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
    one from the directory) and gets a case number straight away.

    Opening a case is free and needs no prior payment — that's what
    lets a new patient get a case number to quote when paying the
    consultation fees. The fees are checked where the service is
    actually used instead: registration + first-consultation when the
    first appointment is booked (backend/appointments/routes.py), the
    video fee for each video appointment, the prescription fee when
    a prescription is issued."""
    provider = db.query(ProviderProfile).filter(ProviderProfile.provider_id == payload.provider_id).first()
    if not provider:
        raise HTTPException(404, "Provider not found")

    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(400, "Please describe why you'd like to see this provider")

    patient_profile = _get_or_create_patient_profile(db, user)

    # case_number is unique; if two cases are opened at the same instant
    # and pick the same next number, the loser retries with a fresh one.
    for attempt in range(5):
        case = Case(
            patient_id=patient_profile.patient_id,
            provider_id=provider.provider_id,
            reason=reason,
            case_number=next_case_number(db),
        )
        db.add(case)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if attempt == 4:
                raise HTTPException(503, "Could not allocate a case number, please try again")
            continue
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


@router.get("/cases/{case_id}", response_model=schemas.CaseOut)
def get_case(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = get_case_or_404(db, case_id)
    assert_case_participant(case, user, db)
    return case


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
