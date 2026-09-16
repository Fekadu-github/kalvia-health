"""
Admin-only dashboard endpoints. Everything here answers the one
question an admin actually has: "what's going on across every
provider — who are their patients, what cases are open, and what's
the appointment history look like." Kept as read-oriented aggregate
endpoints rather than reusing the per-role /cases and /appointments
routes, since the shapes an admin needs (nested by provider, then by
patient) are different from what a patient or provider sees.
"""
from collections import defaultdict
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import (
    Appointment,
    Case,
    CaseStatus,
    AppointmentStatus,
    PatientProfile,
    ProviderProfile,
    ProviderApprovalStatus,
    User,
    Role,
)
from backend.auth.security import require_role
from backend import schemas

router = APIRouter()


@router.get("/admin/providers-overview", response_model=List[schemas.AdminProviderOverview])
def providers_overview(db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    """Every provider, with the patients they've seen, every case
    they're following, and each case's appointment history."""
    providers = db.query(ProviderProfile).all()
    if not providers:
        return []

    # Pull everything in a few bulk queries rather than N+1-ing per provider.
    provider_ids = [p.provider_id for p in providers]
    cases = (
        db.query(Case)
        .filter(Case.provider_id.in_(provider_ids))
        .order_by(Case.created_at.desc())
        .all()
    )
    case_ids = [c.case_id for c in cases]

    appointments_by_case = defaultdict(list)
    if case_ids:
        for appt in (
            db.query(Appointment)
            .filter(Appointment.case_id.in_(case_ids))
            .order_by(Appointment.scheduled_at)
            .all()
        ):
            appointments_by_case[appt.case_id].append(appt)

    patient_ids = {c.patient_id for c in cases}
    patients_by_id = {
        p.patient_id: p
        for p in db.query(PatientProfile).filter(PatientProfile.patient_id.in_(patient_ids)).all()
    } if patient_ids else {}

    user_ids = {p.user_id for p in providers} | {pp.user_id for pp in patients_by_id.values()}
    users_by_id = {u.user_id: u for u in db.query(User).filter(User.user_id.in_(user_ids)).all()} if user_ids else {}

    cases_by_provider = defaultdict(list)
    for c in cases:
        cases_by_provider[c.provider_id].append(c)

    overview = []
    for provider in providers:
        provider_cases = cases_by_provider.get(provider.provider_id, [])
        case_summaries = []
        for c in provider_cases:
            patient_profile = patients_by_id.get(c.patient_id)
            patient_user = users_by_id.get(patient_profile.user_id) if patient_profile else None
            if not patient_user:
                continue
            case_summaries.append(
                schemas.AdminCaseSummary(
                    case_id=c.case_id,
                    status=c.status,
                    reason=c.reason,
                    created_at=c.created_at,
                    updated_at=c.updated_at,
                    patient=schemas.AdminUserSummary.model_validate(patient_user),
                    appointments=[schemas.AppointmentOut.model_validate(a) for a in appointments_by_case.get(c.case_id, [])],
                )
            )

        provider_user = users_by_id.get(provider.user_id)
        if not provider_user:
            continue

        overview.append(
            schemas.AdminProviderOverview(
                provider=schemas.ProviderOut.model_validate(provider),
                user=schemas.AdminUserSummary.model_validate(provider_user),
                patient_count=len({c.patient_id for c in provider_cases}),
                case_count=len(provider_cases),
                cases=case_summaries,
            )
        )

    return overview


@router.get("/admin/summary", response_model=schemas.AdminSummary)
def admin_summary(db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    """Overall counts for the top of the dashboard."""
    total_providers = db.query(ProviderProfile).count()
    total_patients = db.query(PatientProfile).count()
    total_cases = db.query(Case).count()
    total_appointments = db.query(Appointment).count()
    providers_pending = (
        db.query(ProviderProfile).filter(ProviderProfile.approval_status == ProviderApprovalStatus.pending).count()
    )

    cases_by_status = {status.value: 0 for status in CaseStatus}
    for status, count in db.query(Case.status, func.count(Case.case_id)).group_by(Case.status).all():
        cases_by_status[status.value] = count

    appointments_by_status = {status.value: 0 for status in AppointmentStatus}
    for status, count in db.query(Appointment.status, func.count(Appointment.appointment_id)).group_by(Appointment.status).all():
        appointments_by_status[status.value] = count

    return schemas.AdminSummary(
        total_providers=total_providers,
        total_patients=total_patients,
        total_cases=total_cases,
        total_appointments=total_appointments,
        providers_pending_approval=providers_pending,
        cases_by_status=cases_by_status,
        appointments_by_status=appointments_by_status,
    )
