"""
Case closure workflow.

1. After the consultation / prescription is done, the PROVIDER requests
   closure with a short closing summary.
2. Every admin is notified (email + the "needs your attention" strip).
3. The ADMIN confirms the patient's status and approves -> the case is
   closed. Or sends it back with a reason -> the provider is told.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.security import require_role
from backend.database.db import get_db
from backend.database.models import Case, CaseStatus, ProviderProfile, Role, User
from backend.notifications.email import send_email

router = APIRouter()


def _mail(to: Optional[str], subject: str, body: str) -> None:
    try:
        if to:
            send_email(to, subject, body)
    except Exception as exc:  # the in-app status is what matters
        print(f"[closure] email failed: {exc}")


def _case_or_404(db: Session, case_id: str) -> Case:
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(404, "Case not found")
    return case


def _ref(case: Case) -> str:
    return case.case_number or case.case_id


class RequestBody(BaseModel):
    summary: str


class ApproveBody(BaseModel):
    patient_status: str  # the admin's confirmation of the patient's status


class RejectBody(BaseModel):
    note: str


# ---------------- Provider ----------------
@router.post("/cases/{case_id}/closure/request")
def request_closure(case_id: str, body: RequestBody, db: Session = Depends(get_db), user: User = Depends(require_role(Role.provider))):
    case = _case_or_404(db, case_id)
    prov = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if not prov or case.provider_id != prov.provider_id:
        raise HTTPException(403, "This is not your case")
    if case.status == CaseStatus.closed:
        raise HTTPException(400, "This case is already closed")
    if case.closure_status == "requested":
        raise HTTPException(400, "Closure is already waiting for admin approval")
    if not body.summary.strip():
        raise HTTPException(400, "Write a short closing summary first")

    case.closure_status = "requested"
    case.closure_summary = body.summary.strip()
    case.closure_requested_at = datetime.utcnow()
    case.closure_admin_note = None
    db.commit()

    for admin in db.query(User).filter(User.role == Role.admin).all():
        _mail(
            admin.email,
            f"Case {_ref(case)}: closure requested",
            f"Dr. {prov.full_name} asks to close case {_ref(case)}.\n\nSummary:\n{case.closure_summary}\n\n"
            "Open Case closures in the admin menu to confirm the patient's status and approve.",
        )
    return {"ok": True}


@router.post("/cases/{case_id}/closure/withdraw")
def withdraw_closure(case_id: str, db: Session = Depends(get_db), user: User = Depends(require_role(Role.provider))):
    case = _case_or_404(db, case_id)
    prov = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if not prov or case.provider_id != prov.provider_id:
        raise HTTPException(403, "This is not your case")
    if case.closure_status != "requested":
        raise HTTPException(400, "There is no pending closure request")
    case.closure_status = None
    db.commit()
    return {"ok": True}


# ---------------- Admin ----------------
@router.get("/admin/closures")
def list_closures(status: str = "requested", db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    q = db.query(Case)
    q = q.filter(Case.closure_status == "requested") if status == "requested" else q.filter(Case.status == CaseStatus.closed)
    cases: List[Case] = q.order_by(Case.closure_requested_at.desc()).all()
    names = {p.provider_id: p.full_name for p in db.query(ProviderProfile).all()}
    return [
        {
            "case_id": c.case_id,
            "case_number": c.case_number,
            "reason": c.reason,
            "patient_id": c.patient_id,
            "provider_name": names.get(c.provider_id),
            "opened_at": c.created_at.isoformat() if c.created_at else None,
            "closure_summary": c.closure_summary,
            "closure_requested_at": c.closure_requested_at.isoformat() if c.closure_requested_at else None,
            "closure_admin_note": c.closure_admin_note,
            "closed_at": c.closed_at.isoformat() if c.closed_at else None,
        }
        for c in cases
    ]


@router.post("/admin/closures/{case_id}/approve")
def approve_closure(case_id: str, body: ApproveBody, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    case = _case_or_404(db, case_id)
    if case.closure_status != "requested":
        raise HTTPException(400, "This case has no pending closure request")
    if not body.patient_status.strip():
        raise HTTPException(400, "Confirm the patient's status before approving")
    case.closure_status = "approved"
    case.closure_admin_note = body.patient_status.strip()
    case.status = CaseStatus.closed
    case.closed_at = datetime.utcnow()
    db.commit()
    prov = db.query(ProviderProfile).filter(ProviderProfile.provider_id == case.provider_id).first()
    if prov and prov.user:
        _mail(prov.user.email, f"Case {_ref(case)} is closed", f"The admin approved closing case {_ref(case)}.\nPatient status: {case.closure_admin_note}")
    return {"ok": True}


@router.post("/admin/closures/{case_id}/reject")
def reject_closure(case_id: str, body: RejectBody, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    case = _case_or_404(db, case_id)
    if case.closure_status != "requested":
        raise HTTPException(400, "This case has no pending closure request")
    if not body.note.strip():
        raise HTTPException(400, "Tell the provider why the case stays open")
    case.closure_status = "rejected"
    case.closure_admin_note = body.note.strip()
    db.commit()
    prov = db.query(ProviderProfile).filter(ProviderProfile.provider_id == case.provider_id).first()
    if prov and prov.user:
        _mail(prov.user.email, f"Case {_ref(case)} stays open", f"The admin did not approve closing case {_ref(case)}.\nReason: {case.closure_admin_note}")
    return {"ok": True}
