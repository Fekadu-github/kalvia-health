from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import (
    Payment,
    PaymentType,
    PaymentStatus,
    PatientProfile,
    Case,
    User,
    Role,
)
from backend.auth.security import get_current_user, require_role
from backend import schemas

router = APIRouter()

ALLOWED_PROOF_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_PROOF_BYTES = 8 * 1024 * 1024


def _get_patient_profile_or_404(db: Session, user: User) -> PatientProfile:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.user_id).first()
    if not profile:
        raise HTTPException(404, "No patient profile for this account")
    return profile


@router.post("/payments", response_model=schemas.PaymentOut)
def submit_payment(
    payment_type: PaymentType = Form(...),
    case_id: Optional[str] = Form(None),
    amount: Optional[str] = Form(None),
    reference_note: Optional[str] = Form(None),
    proof: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.patient)),
):
    """A patient submits a payment for admin review. No gateway yet —
    this is the manual "state what you paid, optionally attach a
    screenshot, wait for admin approval" flow. video_consultation and
    prescription payments should reference the case they're for;
    registration and first_consultation are patient-level (no case
    yet at submission time for first_consultation)."""
    patient_profile = _get_patient_profile_or_404(db, user)

    if payment_type in (PaymentType.video_consultation, PaymentType.prescription) and not case_id:
        raise HTTPException(400, f"{payment_type.value} payments must specify which case they're for")

    if case_id:
        case = db.query(Case).filter(Case.case_id == case_id).first()
        if not case or case.patient_id != patient_profile.patient_id:
            raise HTTPException(404, "Case not found")

    proof_data = None
    proof_content_type = None
    if proof is not None:
        if proof.content_type not in ALLOWED_PROOF_TYPES:
            raise HTTPException(400, "Proof must be a JPEG, PNG, or WEBP image")
        raw = proof.file.read()
        if len(raw) > MAX_PROOF_BYTES:
            raise HTTPException(400, "Proof image must be under 8MB")
        proof_data = raw
        proof_content_type = proof.content_type

    payment = Payment(
        patient_id=patient_profile.patient_id,
        payment_type=payment_type,
        case_id=case_id,
        amount=amount,
        reference_note=reference_note,
        proof_data=proof_data,
        proof_content_type=proof_content_type,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/payments", response_model=List[schemas.PaymentOut])
def list_my_payments(db: Session = Depends(get_db), user: User = Depends(require_role(Role.patient))):
    patient_profile = _get_patient_profile_or_404(db, user)
    return (
        db.query(Payment)
        .filter(Payment.patient_id == patient_profile.patient_id)
        .order_by(Payment.created_at.desc())
        .all()
    )


def _get_payment_or_404(db: Session, payment_id: str) -> Payment:
    payment = db.query(Payment).filter(Payment.payment_id == payment_id).first()
    if not payment:
        raise HTTPException(404, "Payment not found")
    return payment


@router.get("/payments/{payment_id}/proof")
def get_payment_proof(payment_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Streams the uploaded proof image. Unlike provider photos, this
    is never public — only the patient who submitted it, or an admin,
    can view it."""
    payment = _get_payment_or_404(db, payment_id)

    if user.role not in (Role.admin,):
        patient_profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.user_id).first()
        if not patient_profile or patient_profile.patient_id != payment.patient_id:
            raise HTTPException(403, "Not authorized to view this payment's proof")

    if not payment.proof_data:
        raise HTTPException(404, "No proof uploaded for this payment")

    return Response(content=payment.proof_data, media_type=payment.proof_content_type or "image/jpeg")


# --- Admin review ---
@router.get("/admin/payments", response_model=List[schemas.PaymentAdminOut])
def admin_list_payments(
    status: Optional[PaymentStatus] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(Role.admin)),
):
    """Defaults to nothing filtered (all statuses) if not given —
    pass ?status=pending for the review queue."""
    query = db.query(Payment)
    if status is not None:
        query = query.filter(Payment.status == status)
    payments = query.order_by(Payment.created_at.desc()).all()

    if not payments:
        return []

    patient_ids = {p.patient_id for p in payments}
    patients_by_id = {
        pp.patient_id: pp
        for pp in db.query(PatientProfile).filter(PatientProfile.patient_id.in_(patient_ids)).all()
    }
    user_ids = {pp.user_id for pp in patients_by_id.values()}
    users_by_id = {u.user_id: u for u in db.query(User).filter(User.user_id.in_(user_ids)).all()} if user_ids else {}

    results = []
    for payment in payments:
        patient_profile = patients_by_id.get(payment.patient_id)
        patient_user = users_by_id.get(patient_profile.user_id) if patient_profile else None
        if not patient_user:
            continue
        results.append(
            schemas.PaymentAdminOut(
                **schemas.PaymentOut.model_validate(payment).model_dump(),
                patient=schemas.AdminUserSummary.model_validate(patient_user),
            )
        )
    return results


@router.post("/admin/payments/{payment_id}/approve", response_model=schemas.PaymentOut)
def admin_approve_payment(payment_id: str, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    payment = _get_payment_or_404(db, payment_id)
    if payment.status != PaymentStatus.pending:
        raise HTTPException(400, f"Payment is already {payment.status.value}")

    payment.status = PaymentStatus.approved
    payment.reviewed_by_user_id = admin.user_id
    payment.reviewed_at = datetime.utcnow()
    payment.rejection_reason = None

    # Approving a registration payment is itself an activity signal —
    # it resets the 90-day clock immediately rather than waiting for
    # the patient to do something else first.
    if payment.payment_type == PaymentType.registration:
        patient_profile = db.query(PatientProfile).filter(PatientProfile.patient_id == payment.patient_id).first()
        if patient_profile:
            patient_profile.last_active_at = payment.reviewed_at

    db.commit()
    db.refresh(payment)
    return payment


@router.post("/admin/payments/{payment_id}/reject", response_model=schemas.PaymentOut)
def admin_reject_payment(
    payment_id: str,
    payload: schemas.PaymentRejectRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(Role.admin)),
):
    payment = _get_payment_or_404(db, payment_id)
    if payment.status != PaymentStatus.pending:
        raise HTTPException(400, f"Payment is already {payment.status.value}")

    payment.status = PaymentStatus.rejected
    payment.reviewed_by_user_id = admin.user_id
    payment.reviewed_at = datetime.utcnow()
    payment.rejection_reason = payload.rejection_reason
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/admin/patients/{patient_id}/id-document")
def admin_get_patient_id_document(patient_id: str, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    patient_profile = db.query(PatientProfile).filter(PatientProfile.patient_id == patient_id).first()
    if not patient_profile or not patient_profile.id_document_data:
        raise HTTPException(404, "No ID document on file for this patient")
    return Response(
        content=patient_profile.id_document_data,
        media_type=patient_profile.id_document_content_type or "application/octet-stream",
    )
