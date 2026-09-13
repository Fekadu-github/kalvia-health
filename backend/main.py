from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database.db import Base, engine
from backend.database import models  # noqa: F401 — ensures models are registered before create_all
from backend.auth.routes import router as auth_router
from backend.providers.routes import router as providers_router
from backend.cases.routes import router as cases_router
from backend.appointments.routes import router as appointments_router
from backend.prescriptions.routes import router as prescriptions_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kalvia Health API", version="0.2.0-phase2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten before production
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX, tags=["auth"])
app.include_router(providers_router, prefix=API_PREFIX, tags=["providers"])
app.include_router(cases_router, prefix=API_PREFIX, tags=["cases"])
app.include_router(appointments_router, prefix=API_PREFIX, tags=["appointments"])
app.include_router(prescriptions_router, prefix=API_PREFIX, tags=["prescriptions"])


@app.get("/health")
def health():
    return {"status": "ok", "phase": "2 — appointments, Jitsi video, prescriptions"}
