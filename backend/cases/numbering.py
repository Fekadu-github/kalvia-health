"""
Human-readable case numbers ("KH-2026-000042").

case_id is an internal key (case_ab12cd34ef56) that never appears in
the UI. case_number is what a patient sees, quotes to support, and
picks from the "which case?" list when paying a fee.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from backend.database.models import Case

CASE_NUMBER_PREFIX = "KH"


def next_case_number(db: Session, now: Optional[datetime] = None) -> str:
    """Next free number for the current year: KH-<year>-<6-digit seq>.
    Sequence = highest existing number this year + 1. Two simultaneous
    requests can pick the same value; the unique index on
    cases.case_number rejects the second one and create_case retries."""
    year = (now or datetime.utcnow()).year
    prefix = f"{CASE_NUMBER_PREFIX}-{year}-"
    last = (
        db.query(Case.case_number)
        .filter(Case.case_number.like(prefix + "%"))
        .order_by(Case.case_number.desc())
        .first()
    )
    seq = 0
    if last and last[0]:
        try:
            seq = int(last[0].rsplit("-", 1)[1])
        except (ValueError, IndexError):
            seq = 0
    return f"{prefix}{seq + 1:06d}"
