from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

from backend.database.models import Role, CaseStatus, ConsultationType, AppointmentStatus


# --- Auth ---
class DevLoginRequest(BaseModel):
    username: str
    full_name: str
    role: Role
    external_idp_subject: str
    phone_number: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: Role


# --- Providers ---
class ProviderCreate(BaseModel):
    specialty: str
    bio: Optional[str] = None
    languages: Optional[str] = None


class ProviderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    provider_id: str
    user_id: str
    specialty: str
    bio: Optional[str]
    languages: Optional[str]
    accepting_new_cases: str


# --- Cases ---
class CaseCreate(BaseModel):
    provider_id: str
    reason: str


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    case_id: str
    patient_id: str
    provider_id: str
    status: CaseStatus
    reason: str
    created_at: datetime
    updated_at: datetime


class CaseNoteCreate(BaseModel):
    content: str
    note_type: str = "general"


class CaseNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    note_id: str
    case_id: str
    author_user_id: str
    note_type: str
    content: str
    created_at: datetime


# --- Appointments ---
class AppointmentCreate(BaseModel):
    case_id: str
    consultation_type: ConsultationType = ConsultationType.video
    scheduled_at: datetime
    duration_minutes: int = 30
    notes: Optional[str] = None


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    appointment_id: str
    case_id: str
    requested_by_user_id: str
    consultation_type: ConsultationType
    status: AppointmentStatus
    scheduled_at: datetime
    duration_minutes: int
    jitsi_room_name: Optional[str]
    jitsi_join_url: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


# --- Prescriptions ---
class PrescriptionCreate(BaseModel):
    case_id: str
    appointment_id: Optional[str] = None
    medication_name: str
    dosage: str
    instructions: Optional[str] = None


class PrescriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    prescription_id: str
    case_id: str
    appointment_id: Optional[str]
    issued_by_user_id: str
    medication_name: str
    dosage: str
    instructions: Optional[str]
    created_at: datetime
