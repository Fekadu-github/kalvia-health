"""
Tiny startup migration. Base.metadata.create_all() creates missing
tables but never adds a column to a table that already exists, so
databases created before case numbers existed need this one-off
catch-up. Safe to run on every start: it does nothing once done.
"""
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError, ProgrammingErrorfrom backend.database.db import SessionLocal, engine
from backend.database.models import Case
from backend.cases.numbering import CASE_NUMBER_PREFIX


def ensure_case_numbers() -> None:
    inspector = inspect(engine)
    if "cases" not in inspector.get_table_names():
        return

    columns = {c["name"] for c in inspector.get_columns("cases")}
    with engine.begin() as conn:
        if "case_number" not in columns:
            conn.execute(text("ALTER TABLE cases ADD COLUMN case_number VARCHAR"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_cases_case_number ON cases (case_number)"))

    # Give every older case a number, oldest first, so numbering follows
    # the order cases were actually opened.
    db = SessionLocal()
    try:
        missing = (
            db.query(Case)
            .filter(Case.case_number.is_(None))
            .order_by(Case.created_at, Case.case_id)
            .all()
        )
        if not missing:
            return
        seq_by_year = {}
        for existing in db.query(Case.case_number).filter(Case.case_number.isnot(None)).all():
            try:
                _, year, seq = existing[0].split("-")
                seq_by_year[int(year)] = max(seq_by_year.get(int(year), 0), int(seq))
            except ValueError:
                continue
        for case in missing:
            year = (case.created_at.year if case.created_at else 2026)
            seq_by_year[year] = seq_by_year.get(year, 0) + 1
            case.case_number = f"{CASE_NUMBER_PREFIX}-{year}-{seq_by_year[year]:06d}"
        db.commit()
    finally:
        db.close()


def ensure_case_closure_columns() -> None:
    """Adds the case-closure columns to databases created before the
    closure workflow existed. Safe to run on every start, and safe when
    two instances start at the same moment (the loser's "already exists"
    error is ignored)."""
    inspector = inspect(engine)
    if "cases" not in inspector.get_table_names():
        return
    have = {c["name"] for c in inspector.get_columns("cases")}
    wanted = {
        "closure_status": "VARCHAR",
        "closure_summary": "TEXT",
        "closure_requested_at": "TIMESTAMP",
        "closure_admin_note": "TEXT",
        "closed_at": "TIMESTAMP",
    }
    if_not_exists = "IF NOT EXISTS " if engine.dialect.name == "postgresql" else ""
    for name, kind in wanted.items():
        if name in have:
            continue
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE cases ADD COLUMN {if_not_exists}{name} {kind}"))
        except (ProgrammingError, OperationalError) as exc:
            msg = str(exc).lower()
            if "already exists" not in msg and "duplicate column" not in msg:
                raise