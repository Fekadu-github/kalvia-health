from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database.db import Base, engine
from backend.database import models  # noqa: F401 — ensures models are registered before create_all
from backend.database.migrate import ensure_case_numbers
from backend.auth.routes import router as auth_router
from backend.providers.routes import router as providers_router
from backend.patients.routes import router as patients_router
from backend.payments.routes import router as payments_router
from backend.cases.routes import router as cases_router
from backend.appointments.routes import router as appointments_router
from backend.prescriptions.routes import router as prescriptions_router
from backend.triage.routes import router as triage_router
from backend.admin.routes import router as admin_router
from backend.earnings.routes import router as earnings_router

def _create_tables() -> None:
    # Two instances starting at once (or a redeploy overlapping the old
    # one) can both try to create the same new table. The loser gets
    # "already exists" - harmless, so check again and carry on.
    from sqlalchemy.exc import ProgrammingError

    try:
        Base.metadata.create_all(bind=engine)
    except ProgrammingError as exc:
        if "already exists" not in str(exc):
            raise
        Base.metadata.create_all(bind=engine)


_create_tables()
ensure_case_numbers()  # adds + backfills cases.case_number on databases created before it existed

app = FastAPI(title="Kalvia Health API", version="0.4.0-phase4")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten before production
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX, tags=["auth"])
app.include_router(providers_router, prefix=API_PREFIX, tags=["providers"])
app.include_router(patients_router, prefix=API_PREFIX, tags=["patients"])
app.include_router(payments_router, prefix=API_PREFIX, tags=["payments"])
app.include_router(cases_router, prefix=API_PREFIX, tags=["cases"])
app.include_router(appointments_router, prefix=API_PREFIX, tags=["appointments"])
app.include_router(prescriptions_router, prefix=API_PREFIX, tags=["prescriptions"])
app.include_router(triage_router, prefix=API_PREFIX, tags=["triage"])
app.include_router(admin_router, prefix=API_PREFIX, tags=["admin"])
app.include_router(earnings_router, prefix=API_PREFIX, tags=["earnings"])


@app.get("/health")
def health():
    return {"status": "ok", "phase": "4 — payments, ID verification"}
