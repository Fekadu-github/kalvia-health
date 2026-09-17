import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import (
    Appointment,
    Case,
    ConsultationType,
    AppointmentStatus,
    PatientProfile,
    ProviderProfile,
    User,
    Role,
    PaymentType,
)
from backend.auth.security import get_current_user
from backend.access import get_case_or_404, assert_case_participant
from backend.payments.rules import find_unconsumed_approved, mark_activity
from backend import schemas

router = APIRouter()


def _make_room_name(case_id: str) -> str:
    # Not guessable from the case_id alone, so a stale/shared link
    # can't be used to hop into someone else's room.
    return f"care-{case_id}-{uuid.uuid4().hex[:8]}"


@router.post("/appointments", response_model=schemas.AppointmentOut)
def request_appointment(
    payload: schemas.AppointmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Either side of a case can request an appointment. Video
    consultations get a Jitsi room right away, so it's ready the
    moment the provider confirms.

    Two gates before this succeeds:
    - the patient on the case must have a national ID/passport on
      file (backend/patients/routes.py's upload endpoint)
    - a video appointment additionally needs an unconsumed,
      admin-approved video_consultation payment for this case
    """
    case = get_case_or_404(db, payload.case_id)
    assert_case_participant(case, user, db)

    patient_profile = db.query(PatientProfile).filter(PatientProfile.patient_id == case.patient_id).first()
    if not patient_profile or not patient_profile.has_id_document:
        raise HTTPException(
            403,
            "This patient needs to upload a national ID or passport before an appointment can be booked.",
        )

    video_payment = None
    if payload.consultation_type == ConsultationType.video:
        video_payment = find_unconsumed_approved(
            db, patient_profile.patient_id, PaymentType.video_consultation, case_id=case.case_id
        )
        if not video_payment:
            raise HTTPException(
                402,
                "Video consultation fee required. Submit a video_consultation payment for this case "
                "and wait for admin approval before booking.",
            )

    appointment = Appointment(
        case_id=case.case_id,
        requested_by_user_id=user.user_id,
        consultation_type=payload.consultation_type,
        scheduled_at=payload.scheduled_at,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
    )
    if payload.consultation_type == ConsultationType.video:
        appointment.jitsi_room_name = _make_room_name(case.case_id)

    db.add(appointment)

    if video_payment:
        video_payment.case_id = case.case_id
        video_payment.consumed_at = datetime.utcnow()
        mark_activity(db, patient_profile)

    db.commit()
    db.refresh(appointment)
    return appointment


@router.get("/appointments", response_model=List[schemas.AppointmentOut])
def list_my_appointments(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Cross-case agenda — every appointment on a case this user is a
    participant of, across all their cases."""
    if user.role == Role.patient:
        patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.user_id).first()
        if not patient_profile:
            return []
        case_ids = [c.case_id for c in db.query(Case).filter(Case.patient_id == patient_profile.patient_id).all()]
    elif user.role == Role.provider:
        provider_profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
        if not provider_profile:
            return []
        case_ids = [c.case_id for c in db.query(Case).filter(Case.provider_id == provider_profile.provider_id).all()]
    else:
        # admin / call_center_staff see everything, matching list_my_cases
        case_ids = [c.case_id for c in db.query(Case).all()]

    if not case_ids:
        return []
    return (
        db.query(Appointment)
        .filter(Appointment.case_id.in_(case_ids))
        .order_by(Appointment.scheduled_at)
        .all()
    )


@router.get("/cases/{case_id}/appointments", response_model=List[schemas.AppointmentOut])
def list_case_appointments(case_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    case = get_case_or_404(db, case_id)
    assert_case_participant(case, user, db)
    return (
        db.query(Appointment)
        .filter(Appointment.case_id == case_id)
        .order_by(Appointment.scheduled_at)
        .all()
    )


def _get_appointment_and_case(db: Session, appointment_id: str):
    appointment = db.query(Appointment).filter(Appointment.appointment_id == appointment_id).first()
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    case = get_case_or_404(db, appointment.case_id)
    return appointment, case


@router.post("/appointments/{appointment_id}/confirm", response_model=schemas.AppointmentOut)
def confirm_appointment(appointment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    appointment, case = _get_appointment_and_case(db, appointment_id)
    assert_case_participant(case, user, db)

    if user.role not in (Role.provider, Role.admin, Role.call_center_staff):
        raise HTTPException(403, "Only the provider can confirm an appointment")
    if appointment.status != AppointmentStatus.requested:
        raise HTTPException(400, f"Cannot confirm an appointment in status '{appointment.status.value}'")

    appointment.status = AppointmentStatus.confirmed
    db.commit()
    db.refresh(appointment)
    return appointment


@router.post("/appointments/{appointment_id}/cancel", response_model=schemas.AppointmentOut)
def cancel_appointment(appointment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    appointment, case = _get_appointment_and_case(db, appointment_id)
    assert_case_participant(case, user, db)

    if appointment.status in (AppointmentStatus.cancelled, AppointmentStatus.completed):
        raise HTTPException(400, f"Cannot cancel an appointment in status '{appointment.status.value}'")

    appointment.status = AppointmentStatus.cancelled
    db.commit()
    db.refresh(appointment)
    return appointment


@router.post("/appointments/{appointment_id}/complete", response_model=schemas.AppointmentOut)
def complete_appointment(appointment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    appointment, case = _get_appointment_and_case(db, appointment_id)
    assert_case_participant(case, user, db)

    if user.role not in (Role.provider, Role.admin, Role.call_center_staff):
        raise HTTPException(403, "Only the provider can mark an appointment complete")
    if appointment.status != AppointmentStatus.confirmed:
        raise HTTPException(400, f"Cannot complete an appointment in status '{appointment.status.value}'")

    appointment.status = AppointmentStatus.completed
    db.commit()
    db.refresh(appointment)
    return appointment
