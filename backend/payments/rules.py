"""
Shared payment-eligibility helpers for anything that's gated behind
an admin-approved payment (opening a case, booking a video
appointment, issuing a prescription). Kept here rather than
duplicated in each router, same reasoning as backend/access.py.
"""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from backend.database.models import Payment, PaymentType, PaymentStatus, PatientProfile

# How long an approved registration payment stays valid without any
# further activity. After this many days of inactivity, the patient
# is treated as new and must submit the registration fee again.
REGISTRATION_VALIDITY_DAYS = 90


def registration_active(db: Session, patient: PatientProfile) -> bool:
    """True if this patient has an approved registration payment that
    hasn't lapsed. Lapses when more than REGISTRATION_VALIDITY_DAYS
    have passed since their last recorded activity (see
    mark_activity) — or since the approval itself, if they've never
    used a paid service since registering."""
    latest = (
        db.query(Payment)
        .filter(
            Payment.patient_id == patient.patient_id,
            Payment.payment_type == PaymentType.registration,
            Payment.status == PaymentStatus.approved,
        )
        .order_by(Payment.reviewed_at.desc())
        .first()
    )
    if not latest:
        return False

    reference_time = patient.last_active_at or latest.reviewed_at
    if reference_time is None:
        return False

    return (datetime.utcnow() - reference_time) <= timedelta(days=REGISTRATION_VALIDITY_DAYS)


def find_unconsumed_approved(
    db: Session,
    patient_id: str,
    payment_type: PaymentType,
    case_id: Optional[str] = None,
) -> Optional[Payment]:
    """The oldest approved-but-not-yet-used payment of this type for
    this patient. When case_id is given, also accepts a payment that
    hasn't been tied to a case yet (case_id is null) — that's the
    normal shape for first_consultation, submitted before the case
    exists."""
    query = db.query(Payment).filter(
        Payment.patient_id == patient_id,
        Payment.payment_type == payment_type,
        Payment.status == PaymentStatus.approved,
        Payment.consumed_at.is_(None),
    )
    if case_id is not None:
        query = query.filter((Payment.case_id == case_id) | (Payment.case_id.is_(None)))
    return query.order_by(Payment.reviewed_at.asc()).first()


def mark_activity(db: Session, patient: PatientProfile) -> None:
    """Call whenever a patient actually uses a paid service (opens a
    case, has a video appointment booked, gets a prescription) — this
    is what keeps their registration fee valid past 90 days."""
    patient.last_active_at = datetime.utcnow()
