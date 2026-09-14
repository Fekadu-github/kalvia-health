from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Triage, User, Role
from backend.auth.security import get_current_user
from backend.access import get_case_or_404, assert_case_participant
from backend import schemas

router = APIRouter()


@router.put("/cases/{case_id}/triage", response_model=schemas.TriageOut)
def upsert_triage(
    case_id: str,
    payload: schemas.TriageUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Creates the triage record on first submit, or updates it on any
    later submit — same endpoint for the patient's first pass and the
    provider filling in whatever was left blank. Only a provider (or
    admin/call-center-staff) can flip mark_complete to true.
    """
    case = get_case_or_404(db, case_id)
    assert_case_participant(case, user, db)

    if payload.mark_complete and user.role not in (Role.provider, Role.admin, Role.call_center_staff):
        raise HTTPException(403, "Only the provider can mark triage as complete")

    triage = db.query(Triage).filter(Triage.case_id == case_id).first()
    if triage is None:
        triage = Triage(case_id=case_id)
        db.add(triage)

    triage.patient_name = payload.patient_name
    triage.age = payload.age
    triage.symptoms = payload.symptoms
    triage.duration = payload.duration
    triage.severity = payload.severity
    triage.medical_history = payload.medical_history
    triage.medications = payload.medications
    triage.allergies = payload.allergies
    triage.additional_notes = payload.additional_notes
    triage.completed_by_user_id = user.user_id
    if payload.mark_complete:
        triage.is_complete = "true"
    elif triage.is_complete is None:
        triage.is_complete = "false"

    db.commit()
    db.refresh(triage)
    return triage


@router.get("/cases/{case_id}/triage", response_model=Optional[schemas.TriageOut])
def get_triage(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = get_case_or_404(db, case_id)
    assert_case_participant(case, user, db)
    return db.query(Triage).filter(Triage.case_id == case_id).first()
