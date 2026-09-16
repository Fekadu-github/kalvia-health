import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.database.db import Base, engine
from backend.database import models  # noqa: F401 — ensures models are registered before create_all
from backend.auth.routes import router as auth_router
from backend.providers.routes import router as providers_router
from backend.cases.routes import router as cases_router
from backend.appointments.routes import router as appointments_router
from backend.prescriptions.routes import router as prescriptions_router
from backend.triage.routes import router as triage_router
from backend.admin.routes import router as admin_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Kalvia Health API", version="0.3.0-phase3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten before production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serves uploaded provider photos at /static/provider_photos/<file>.
# ProviderProfile.photo_url builds the full link to these.
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(_STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX, tags=["auth"])
app.include_router(providers_router, prefix=API_PREFIX, tags=["providers"])
app.include_router(cases_router, prefix=API_PREFIX, tags=["cases"])
app.include_router(appointments_router, prefix=API_PREFIX, tags=["appointments"])
app.include_router(prescriptions_router, prefix=API_PREFIX, tags=["prescriptions"])
app.include_router(triage_router, prefix=API_PREFIX, tags=["triage"])
app.include_router(admin_router, prefix=API_PREFIX, tags=["admin"])


@app.get("/health")
def health():
    return {"status": "ok", "phase": "3 — patient/provider auth, triage intake"}
