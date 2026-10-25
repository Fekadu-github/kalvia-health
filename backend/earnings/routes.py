"""
Monthly earnings: cases, fees by consultation/payment type, the
admin's manual provider share %, and the provider-facing statement.

A "task" is an approved payment that has been consumed on a case
(first consultation, video consultation, prescription). Its month is
the month it was consumed (= when the work was done). Registration
fees belong to the platform, not to any provider, so they appear in
the admin totals only.
"""
import re
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.security import require_role
from backend.database.db import get_db
from backend.database.models import (
    Appointment, AppointmentStatus, Case, Payment, PaymentStatus, PaymentType,
    ProviderPayout, ProviderProfile, Role, User,
)
from backend.notifications.email import send_email

router = APIRouter()

TASK_TYPES = [PaymentType.first_consultation, PaymentType.video_consultation, PaymentType.prescription]


def parse_amount(raw: Optional[str]) -> float:
    """Amounts are free text ("500 ETB", "1,200.50"). Pull out the number."""
    if not raw:
        return 0.0
    cleaned = re.sub(r"[^0-9.,]", "", raw)
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", "") if len(cleaned.split(",")[-1]) == 3 else cleaned.replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def month_bounds(month: Optional[str]):
    month = month or datetime.utcnow().strftime("%Y-%m")
    try:
        start = datetime.strptime(month, "%Y-%m")
    except ValueError:
        raise HTTPException(400, "month must look like 2026-10")
    end = datetime(start.year + (start.month == 12), start.month % 12 + 1, 1)
    return month, start, end


def _by_type(rows: List[dict]) -> List[dict]:
    out: Dict[str, dict] = {}
    for r in rows:
        d = out.setdefault(r["type"], {"type": r["type"], "count": 0, "total": 0.0})
        d["count"] += 1
        d["total"] += r["amount"]
    return [{**d, "total": round(d["total"], 2)} for d in out.values()]


def _share(gross: float, percent: Optional[float]) -> Optional[float]:
    return None if percent is None else round(gross * percent / 100.0, 2)


def provider_month(db: Session, provider: ProviderProfile, month: str, start, end) -> dict:
    rows = (
        db.query(Payment, Case)
        .join(Case, Payment.case_id == Case.case_id)
        .filter(
            Case.provider_id == provider.provider_id,
            Payment.status == PaymentStatus.approved,
            Payment.payment_type.in_(TASK_TYPES),
            Payment.consumed_at >= start,
            Payment.consumed_at < end,
        )
        .order_by(Payment.consumed_at.asc())
        .all()
    )
    tasks = [
        {
            "payment_id": p.payment_id,
            "date": p.consumed_at.isoformat(),
            "type": p.payment_type.value,
            "case_id": c.case_id,
            "case_number": c.case_number,
            "amount": parse_amount(p.amount),
        }
        for p, c in rows
    ]
    gross = round(sum(t["amount"] for t in tasks), 2)
    cases_opened = (
        db.query(Case).filter(Case.provider_id == provider.provider_id, Case.created_at >= start, Case.created_at < end).count()
    )
    appts = (
        db.query(Appointment)
        .join(Case, Appointment.case_id == Case.case_id)
        .filter(
            Case.provider_id == provider.provider_id,
            Appointment.status == AppointmentStatus.completed,
            Appointment.scheduled_at >= start,
            Appointment.scheduled_at < end,
        )
        .all()
    )
    appts_by_type: Dict[str, int] = {}
    for a in appts:
        appts_by_type[a.consultation_type.value] = appts_by_type.get(a.consultation_type.value, 0) + 1

    payout = (
        db.query(ProviderPayout).filter(ProviderPayout.provider_id == provider.provider_id, ProviderPayout.month == month).first()
    )
    percent = payout.share_percent if payout else None
    for t in tasks:
        t["share_amount"] = _share(t["amount"], percent)
    return {
        "provider_id": provider.provider_id,
        "full_name": provider.full_name,
        "specialty": provider.specialty,
        "cases_opened": cases_opened,
        "cases_worked": len({t["case_id"] for t in tasks}),
        "tasks_count": len(tasks),
        "completed_consultations": [{"type": k, "count": v} for k, v in appts_by_type.items()],
        "gross": gross,
        "by_type": _by_type(tasks),
        "share_percent": percent,
        "share_amount": _share(gross, percent),
        "note": payout.note if payout else None,
        "notified_at": payout.notified_at.isoformat() if payout and payout.notified_at else None,
        "notified_amount": payout.notified_amount if payout else None,
        "tasks": tasks,
    }


# ---------------- Admin ----------------
@router.get("/admin/earnings")
def admin_earnings(month: Optional[str] = None, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    month, start, end = month_bounds(month)

    received = (
        db.query(Payment)
        .filter(Payment.status == PaymentStatus.approved, Payment.reviewed_at >= start, Payment.reviewed_at < end)
        .all()
    )
    received_rows = [{"type": p.payment_type.value, "amount": parse_amount(p.amount)} for p in received]

    providers = [provider_month(db, p, month, start, end) for p in db.query(ProviderProfile).all()]
    cases_total = db.query(Case).filter(Case.created_at >= start, Case.created_at < end).count()

    appts = (
        db.query(Appointment)
        .filter(Appointment.status == AppointmentStatus.completed, Appointment.scheduled_at >= start, Appointment.scheduled_at < end)
        .all()
    )
    appt_counts: Dict[str, int] = {}
    for a in appts:
        appt_counts[a.consultation_type.value] = appt_counts.get(a.consultation_type.value, 0) + 1

    total_received = round(sum(r["amount"] for r in received_rows), 2)
    shares_set = [p["share_amount"] for p in providers if p["share_amount"] is not None]
    return {
        "month": month,
        "cases_opened": cases_total,
        "total_received": total_received,
        "received_by_type": _by_type(received_rows),
        "completed_consultations": [{"type": k, "count": v} for k, v in appt_counts.items()],
        "total_provider_shares": round(sum(shares_set), 2),
        "platform_net": round(total_received - sum(shares_set), 2),
        "providers": providers,
    }


class ShareBody(BaseModel):
    share_percent: float
    note: Optional[str] = None


def _get_provider_or_404(db: Session, provider_id: str) -> ProviderProfile:
    prov = db.query(ProviderProfile).filter(ProviderProfile.provider_id == provider_id).first()
    if not prov:
        raise HTTPException(404, "Provider not found")
    return prov


def _get_or_create_payout(db: Session, provider_id: str, month: str) -> ProviderPayout:
    payout = db.query(ProviderPayout).filter(ProviderPayout.provider_id == provider_id, ProviderPayout.month == month).first()
    if not payout:
        payout = ProviderPayout(provider_id=provider_id, month=month)
        db.add(payout)
    return payout


@router.put("/admin/earnings/{provider_id}/{month}/share")
def set_share(provider_id: str, month: str, body: ShareBody, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    month, _, _ = month_bounds(month)
    _get_provider_or_404(db, provider_id)
    if not 0 <= body.share_percent <= 100:
        raise HTTPException(400, "Share percent must be between 0 and 100")
    payout = _get_or_create_payout(db, provider_id, month)
    payout.share_percent = body.share_percent
    payout.note = body.note
    db.commit()
    return {"ok": True}


@router.post("/admin/earnings/{provider_id}/{month}/notify")
def notify_provider(provider_id: str, month: str, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    month, start, end = month_bounds(month)
    prov = _get_provider_or_404(db, provider_id)
    data = provider_month(db, prov, month, start, end)
    if data["share_percent"] is None:
        raise HTTPException(400, "Set the share percent first")
    payout = _get_or_create_payout(db, provider_id, month)
    payout.notified_amount = data["share_amount"]
    payout.notified_gross = data["gross"]
    payout.notified_at = datetime.utcnow()
    db.commit()
    try:
        if not prov.user.email:
            raise ValueError("provider has no email")
        send_email(
            prov.user.email,
            f"Your earnings statement for {month}",
            f"Hello {prov.full_name},\n\nYour amount receivable for {month} is {data['share_amount']:.2f} "
            f"({data['share_percent']}% of {data['gross']:.2f}) across {data['cases_worked']} case(s).\n"
            f"{('Note: ' + data['note']) if data['note'] else ''}\nSee the Earnings page for the per-task breakdown.",
        )
    except Exception as exc:  # the in-app notice is what matters; never fail on email
        print(f"[earnings] email failed: {exc}")
    return {"ok": True, "notified_amount": payout.notified_amount}


# ---------------- Provider ----------------
@router.get("/earnings/me")
def my_earnings(month: Optional[str] = None, db: Session = Depends(get_db), user: User = Depends(require_role(Role.provider))):
    month, start, end = month_bounds(month)
    prov = db.query(ProviderProfile).filter(ProviderProfile.user_id == user.user_id).first()
    if not prov:
        raise HTTPException(404, "No provider profile")
    data = provider_month(db, prov, month, start, end)
    notified = data["notified_at"] is not None
    if not notified:
        # Amounts are only shown once the admin has set the % and notified.
        data["share_percent"] = None
        data["share_amount"] = None
        for t in data["tasks"]:
            t["share_amount"] = None
    history = (
        db.query(ProviderPayout)
        .filter(ProviderPayout.provider_id == prov.provider_id, ProviderPayout.notified_at.isnot(None))
        .order_by(ProviderPayout.month.desc())
        .all()
    )
    data["notified"] = notified
    data["history"] = [{"month": h.month, "gross": h.notified_gross, "amount": h.notified_amount, "notified_at": h.notified_at.isoformat()} for h in history]
    data["overall_receivable"] = round(sum(h.notified_amount or 0 for h in history), 2)
    return data
