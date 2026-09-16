from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field

from backend.database.models import Role, CaseStatus, ConsultationType, AppointmentStatus, ProviderApprovalStatus


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


class PatientSignupRequest(BaseModel):
    full_name: str
    password: str = Field(min_length=8)
    email: Optional[str] = None
    phone_number: Optional[str] = None


class LoginRequest(BaseModel):
    identifier: str  # email or phone
    password: str


class ProviderLoginRequest(BaseModel):
    username: str
    password: str


class AdminBootstrapRequest(BaseModel):
    """One-time use: creates the very first admin account. Rejected
    once any admin already exists — after that, use /auth/admin/login."""
    bootstrap_secret: str
    username: str
    full_name: str
    password: str = Field(min_length=8)


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class PasswordResetRequest(BaseModel):
    identifier: str  # username, email, or phone


class PasswordResetConfirmRequest(BaseModel):
    identifier: str
    code: str
    new_password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    message: str


class AdminBootstrapRequest(BaseModel):
    """One-time use: creates the very first admin account. Rejected
    once any admin already exists — after that, use /auth/admin/login."""
    bootstrap_secret: str
    username: str
    full_name: str
    password: str = Field(min_length=8)


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class PasswordResetRequest(BaseModel):
    identifier: str  # username, email, or phone


class PasswordResetConfirmRequest(BaseModel):
    identifier: str
    code: str
    new_password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    message: str


class ProviderCreateByAdmin(BaseModel):
    username: str
    full_name: str
    password: str = Field(min_length=8)
    specialty: str
    bio: Optional[str] = None
    languages: Optional[str] = None
    license_number: Optional[str] = None
    years_experience: Optional[int] = Field(default=None, ge=0, le=80)
    experience_summary: Optional[str] = None


class ProviderAccountOut(BaseModel):
    username: str
    full_name: str
    provider_id: str


# --- Providers ---
class ProviderCreate(BaseModel):
    specialty: str
    bio: Optional[str] = None
    languages: Optional[str] = None
    license_number: str
    years_experience: Optional[int] = Field(default=None, ge=0, le=80)
    experience_summary: Optional[str] = None


class ProviderUpdate(BaseModel):
    """Every field optional — a provider can update just the piece
    that changed. Any change resubmits the profile for admin
    approval, so this never touches approval_status directly."""
    specialty: Optional[str] = None
    bio: Optional[str] = None
    languages: Optional[str] = None
    license_number: Optional[str] = None
    years_experience: Optional[int] = Field(default=None, ge=0, le=80)
    experience_summary: Optional[str] = None
    accepting_new_cases: Optional[bool] = None


class ProviderOut(BaseModel):
    """Full profile — what the provider sees of their own record, and
    what admins see. Includes the license number and approval
    workflow fields that patients never get."""
    model_config = ConfigDict(from_attributes=True)
    provider_id: str
    user_id: str
    specialty: str
    bio: Optional[str]
    languages: Optional[str]
    accepting_new_cases: str
    license_number: Optional[str]
    years_experience: Optional[int]
    experience_summary: Optional[str]
    approval_status: ProviderApprovalStatus
    rejection_reason: Optional[str]
    approved_at: Optional[datetime]
    photo_url: Optional[str] = None


class ProviderPublicOut(BaseModel):
    """What a patient sees in the directory — specialty, bio,
    languages, and the experience summary, but never the license
    number or the approval workflow state."""
    model_config = ConfigDict(from_attributes=True)
    provider_id: str
    specialty: str
    bio: Optional[str]
    languages: Optional[str]
    accepting_new_cases: str
    years_experience: Optional[int]
    experience_summary: Optional[str]
    photo_url: Optional[str] = None


class ProviderRejectRequest(BaseModel):
    rejection_reason: Optional[str] = None


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


# --- Triage ---
class TriageUpsert(BaseModel):
    patient_name: str
    age: int = Field(gt=0, lt=130)
    symptoms: str
    duration: str
    severity: Optional[str] = None
    medical_history: Optional[str] = None
    medications: Optional[str] = None
    allergies: Optional[str] = None
    additional_notes: Optional[str] = None
    mark_complete: bool = False


# --- Admin dashboard ---
class AdminUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    full_name: str
    username: str
    email: Optional[str] = None
    phone_number: Optional[str] = None


class AdminCaseSummary(BaseModel):
    case_id: str
    status: CaseStatus
    reason: str
    created_at: datetime
    updated_at: datetime
    patient: AdminUserSummary
    appointments: List[AppointmentOut]


class AdminProviderOverview(BaseModel):
    provider: ProviderOut
    user: AdminUserSummary
    patient_count: int
    case_count: int
    cases: List[AdminCaseSummary]


class AdminSummary(BaseModel):
    total_providers: int
    total_patients: int
    total_cases: int
    total_appointments: int
    providers_pending_approval: int
    cases_by_status: dict
    appointments_by_status: dict


class TriageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    triage_id: str
    case_id: str
    patient_name: str
    age: int
    symptoms: str
    duration: str
    severity: Optional[str]
    medical_history: Optional[str]
    medications: Optional[str]
    allergies: Optional[str]
    additional_notes: Optional[str]
    is_complete: str
    completed_by_user_id: str
    created_at: datetime
    updated_at: datetime
