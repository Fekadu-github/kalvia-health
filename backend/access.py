"""
Shared authorization helpers for anything that hangs off a case
(appointments, prescriptions, and future note types). Kept here
rather than duplicated in each router, since "is this user allowed
to touch this case" is the same question everywhere.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.database.models import Case, PatientProfile, ProviderProfile, User, Role


def get_case_or_404(db: Session, case_id: str) -> Case:
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    return case


def assert_case_participant(case: Case, user: User, db: Session) -> None:
    """Raise 403 unless the user is the patient or provider on this
    case. admin / call_center_staff see everything, matching the
    Phase 1 list_my_cases convention."""
    if user.role in (Role.admin, Role.call_center_staff):
        return

    if user.role == Role.patient:
        patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.user_id).first()
        if patient_profile and patient_profile.patient_id == case.patient_id:
            return

    if user.role == Role.provider:
        provider_profile = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
        if provider_profile and provider_profile.provider_id == case.provider_id:
            return

    raise HTTPException(403, "Not a participant on this case")
