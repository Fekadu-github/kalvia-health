"""
Monthly earnings: cases, fees by consultation/payment type, the
admin's manual provider share %, and the provider-facing statement.

A "task" is an approved fee (first consultation, video consultation,
...) that belongs to a case. Its month is the month the admin approved
the payment, and its provider is the provider of that case. Fees with
no case yet, and registration fees, belong to the platform: they show
in the admin totals and fee list but are never shared.
"""
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.security import require_role
from backend.database.db import get_db
from backend.database.models import (
    Appointment, AppointmentStatus, Case, Payment, PaymentStatus, PaymentType,
    ProviderPayout, ProviderProfile, Role, ShareRule, User,
)
from backend.notifications.email import send_email

router = APIRouter()

# Every fee type except registration can be shared. A fee type added to
# PaymentType in future shows up in the admin dropdown automatically.
TASK_TYPES = [t for t in PaymentType if t != PaymentType.registration]


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


def provider_month(db: Session, provider: ProviderProfile, month: Optional[str], start, end) -> dict:
    rows = (
        db.query(Payment, Case)
        .join(Case, Payment.case_id == Case.case_id)
        .filter(
            Case.provider_id == provider.provider_id,
            Payment.status == PaymentStatus.approved,
            Payment.payment_type.in_(TASK_TYPES),
            Payment.reviewed_at >= start,
            Payment.reviewed_at < end,
        )
        .order_by(Payment.reviewed_at.asc())
        .all()
    )
    tasks = [
        {
            "payment_id": p.payment_id,
            "date": p.reviewed_at.isoformat(),
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
        if month else None
    )
    rules = {r.payment_type: r for r in db.query(ShareRule).filter(ShareRule.provider_id == provider.provider_id).all()}
    for t in tasks:
        r = rules.get(t["type"])
        t["share_percent"] = r.percent if r else None
        t["share_amount"] = round(t["amount"] * (r.percent if r else 0) / 100.0, 2)

    # One calculation line per rule the admin has added.
    by_key = {}
    for t in tasks:
        d = by_key.setdefault(t["type"], {"count": 0, "fees": 0.0})
        d["count"] += 1
        d["fees"] += t["amount"]
    lines = []
    for r in sorted(rules.values(), key=lambda r: r.created_at or datetime.min):
        d = by_key.get(r.payment_type, {"count": 0, "fees": 0.0})
        fees = round(d["fees"], 2)
        lines.append({
            "type": r.payment_type,
            "count": d["count"],
            "fees": fees,
            "rule_id": r.rule_id,
            "percent": r.percent,
            "share": round(fees * r.percent / 100.0, 2),
        })
    share_total = round(sum(l["share"] for l in lines), 2)
    shared_fees = round(sum(l["fees"] for l in lines), 2)
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
        "lines": lines,
        "shared_fees": shared_fees,
        "share_total": share_total,
        "note": payout.note if payout else None,
        "notified_at": payout.notified_at.isoformat() if payout and payout.notified_at else None,
        "notified_amount": payout.notified_amount if payout else None,
        "tasks": tasks,
    }


# ---------------- Admin ----------------
def build_report(db: Session, start: datetime, end: datetime, month: Optional[str], label: str) -> dict:
    """Totals, fee list and provider shares for [start, end). month is only
    given for a calendar-month view (it unlocks notified snapshots)."""
    received = (
        db.query(Payment)
        .filter(Payment.status == PaymentStatus.approved, Payment.reviewed_at >= start, Payment.reviewed_at < end)
        .all()
    )
    received_rows = [{"type": p.payment_type.value, "amount": parse_amount(p.amount)} for p in received]

    case_ids = [p.case_id for p in received if p.case_id]
    case_map = {c.case_id: c for c in db.query(Case).filter(Case.case_id.in_(case_ids)).all()} if case_ids else {}
    prov_map = {pr.provider_id: pr.full_name for pr in db.query(ProviderProfile).all()}
    fees = []
    for p in sorted(received, key=lambda x: x.reviewed_at or datetime.min):
        c = case_map.get(p.case_id) if p.case_id else None
        fees.append({
            "payment_id": p.payment_id,
            "date": p.reviewed_at.isoformat() if p.reviewed_at else None,
            "type": p.payment_type.value,
            "amount": parse_amount(p.amount),
            "case_id": c.case_id if c else None,
            "case_number": (c.case_number or c.case_id) if c else None,
            "provider_name": prov_map.get(c.provider_id) if c else None,
        })

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
    shares_set = [p["notified_amount"] if p["notified_at"] else p["share_total"] for p in providers]
    return {
        "month": label,
        "period_start": start.date().isoformat(),
        "period_end": (end - timedelta(days=1)).date().isoformat(),
        "fee_types": [t.value for t in TASK_TYPES],
        "cases_opened": cases_total,
        "cases_with_fees": len(set(case_ids)),
        "fees": fees,
        "total_received": total_received,
        "received_by_type": _by_type(received_rows),
        "completed_consultations": [{"type": k, "count": v} for k, v in appt_counts.items()],
        "total_provider_shares": round(sum(shares_set), 2),
        "platform_net": round(total_received - sum(shares_set), 2),
        "providers": providers,
    }


@router.get("/admin/earnings")
def admin_earnings(month: Optional[str] = None, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    month, start, end = month_bounds(month)
    return build_report(db, start, end, month, month)


def _parse_range(start: str, end: str):
    try:
        s = datetime.strptime(start, "%Y-%m-%d")
        e = datetime.strptime(end, "%Y-%m-%d") + timedelta(days=1)  # end date is inclusive
    except ValueError:
        raise HTTPException(400, "Dates must look like 2026-10-31")
    if e <= s:
        raise HTTPException(400, "End date must not be before start date")
    return s, e


@router.get("/admin/reports/earnings")
def period_report(start: str, end: str, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    s, e = _parse_range(start, end)
    return build_report(db, s, e, None, f"{start} to {end}")


@router.get("/admin/reports/earnings/export")
def export_report(start: str, end: str, format: str = "pdf", db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    from fastapi.responses import Response
    from backend.earnings.export import build_pdf, build_xlsx

    s, e = _parse_range(start, end)
    report = build_report(db, s, e, None, f"{start} to {end}")
    name = f"earnings-report_{start}_to_{end}"
    if format == "xlsx":
        return Response(
            build_xlsx(report),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{name}.xlsx"'},
        )
    if format == "pdf":
        return Response(build_pdf(report), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})
    raise HTTPException(400, "format must be pdf or xlsx")


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


class RuleBody(BaseModel):
    provider_id: str
    payment_type: str
    percent: float


class RuleUpdate(BaseModel):
    percent: float
    payment_type: Optional[str] = None


def _check_percent(p: float):
    if not 0 <= p <= 100:
        raise HTTPException(400, "Percent must be between 0 and 100")


@router.post("/admin/share-rules")
def add_rule(body: RuleBody, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    _get_provider_or_404(db, body.provider_id)
    if body.payment_type not in {t.value for t in TASK_TYPES}:
        raise HTTPException(400, "This fee type cannot be shared")
    _check_percent(body.percent)
    if db.query(ShareRule).filter(ShareRule.provider_id == body.provider_id, ShareRule.payment_type == body.payment_type).first():
        raise HTTPException(409, "A percent already exists for this fee type - edit it instead")
    db.add(ShareRule(provider_id=body.provider_id, payment_type=body.payment_type, percent=body.percent))
    db.commit()
    return {"ok": True}


@router.put("/admin/share-rules/{rule_id}")
def edit_rule(rule_id: str, body: RuleUpdate, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    _check_percent(body.percent)
    rule = db.query(ShareRule).filter(ShareRule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    if body.payment_type and body.payment_type != rule.payment_type:
        if body.payment_type not in {t.value for t in TASK_TYPES}:
            raise HTTPException(400, "This fee type cannot be shared")
        if db.query(ShareRule).filter(ShareRule.provider_id == rule.provider_id, ShareRule.payment_type == body.payment_type).first():
            raise HTTPException(409, "There is already a line for this fee type")
        rule.payment_type = body.payment_type
    rule.percent = body.percent
    db.commit()
    return {"ok": True}


@router.delete("/admin/share-rules/{rule_id}")
def delete_rule(rule_id: str, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    rule = db.query(ShareRule).filter(ShareRule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"ok": True}


class NoteBody(BaseModel):
    note: Optional[str] = None


@router.put("/admin/earnings/{provider_id}/{month}/note")
def set_note(provider_id: str, month: str, body: NoteBody, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    month, _, _ = month_bounds(month)
    _get_provider_or_404(db, provider_id)
    _get_or_create_payout(db, provider_id, month).note = body.note
    db.commit()
    return {"ok": True}


@router.post("/admin/earnings/{provider_id}/{month}/notify")
def notify_provider(provider_id: str, month: str, db: Session = Depends(get_db), admin: User = Depends(require_role(Role.admin))):
    month, start, end = month_bounds(month)
    prov = _get_provider_or_404(db, provider_id)
    data = provider_month(db, prov, month, start, end)
    payout = _get_or_create_payout(db, provider_id, month)
    payout.notified_amount = data["share_total"]
    payout.notified_gross = data["gross"]
    payout.notified_at = datetime.utcnow()
    db.commit()
    lines = "\n".join(
        f"  {l['type']}: {l['count']} x, fees {l['fees']:.2f}, "
        + (f"{l['percent']}% = {l['share']:.2f}" if l["percent"] is not None else "not shared")
        for l in data["lines"]
    )
    try:
        if not prov.user.email:
            raise ValueError("provider has no email")
        send_email(
            prov.user.email,
            f"Your earnings statement for {month}",
            f"Hello {prov.full_name},\n\nYour amount receivable for {month} is {data['share_total']:.2f}.\n\n{lines}\n"
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
        # Amounts are only shown once the admin has notified.
        data["share_total"] = None
        data["lines"] = []
        for t in data["tasks"]:
            t["share_amount"] = None
            t["share_percent"] = None
    history = (
        db.query(ProviderPayout)
        .filter(ProviderPayout.provider_id == prov.provider_id, ProviderPayout.notified_at.isnot(None))
        .order_by(ProviderPayout.month.desc())
        .all()
    )
    if notified:
        data["share_total"] = data["notified_amount"]  # what the provider was told
    data["notified"] = notified
    data["history"] = [{"month": h.month, "gross": h.notified_gross, "amount": h.notified_amount, "notified_at": h.notified_at.isoformat()} for h in history]
    data["overall_receivable"] = round(sum(h.notified_amount or 0 for h in history), 2)
    return data
