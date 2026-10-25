from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Prescription, Appointment, PatientProfile, User, Role, PaymentType
from backend.auth.security import get_current_user
from backend.access import get_case_or_404, assert_case_participant
from backend.payments.rules import find_unconsumed_approved, mark_activity
from backend import schemas

router = APIRouter()


@router.post("/prescriptions", response_model=schemas.PrescriptionOut)
def issue_prescription(
    payload: schemas.PrescriptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, payload.case_id)
    assert_case_participant(case, user, db)

    if user.role not in (Role.provider, Role.admin):
        raise HTTPException(403, "Only the provider on this case can issue a prescription")

    if payload.appointment_id:
        appointment = db.query(Appointment).filter(Appointment.appointment_id == payload.appointment_id).first()
        if not appointment or appointment.case_id != case.case_id:
            raise HTTPException(400, "Appointment does not belong to this case")

    patient_profile = db.query(PatientProfile).filter(PatientProfile.patient_id == case.patient_id).first()
    prescription_payment = find_unconsumed_approved(
        db, case.patient_id, PaymentType.prescription, case_id=case.case_id
    )
    if not prescription_payment:
        raise HTTPException(
            402,
            "Prescription fee required. Have the patient submit a prescription payment for this case "
            "and wait for admin approval before issuing.",
        )

    prescription = Prescription(
        case_id=case.case_id,
        appointment_id=payload.appointment_id,
        issued_by_user_id=user.user_id,
        medication_name=payload.medication_name,
        dosage=payload.dosage,
        instructions=payload.instructions,
    )
    db.add(prescription)

    prescription_payment.case_id = case.case_id
    prescription_payment.consumed_at = datetime.utcnow()
    if patient_profile:
        mark_activity(db, patient_profile)

    db.commit()
    db.refresh(prescription)
    return prescription


@router.get("/cases/{case_id}/prescriptions", response_model=List[schemas.PrescriptionOut])
def list_case_prescriptions(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = get_case_or_404(db, case_id)
    assert_case_participant(case, user, db)
    return (
        db.query(Prescription)
        .filter(Prescription.case_id == case_id)
        .order_by(Prescription.created_at.desc())
        .all()
    )
