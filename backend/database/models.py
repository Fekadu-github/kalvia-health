import enum
import os
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text, Integer
from sqlalchemy.orm import relationship

from backend.database.db import Base

JITSI_BASE_URL = os.getenv("JITSI_BASE_URL", "https://meet.jit.si")
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")
PROVIDER_PHOTO_DIR = "provider_photos"


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class Role(str, enum.Enum):
    patient = "patient"
    provider = "provider"
    call_center_staff = "call_center_staff"
    admin = "admin"


class User(Base):
    """
    A single login identity, regardless of role. Role-specific data
    (specialty, medical history, etc.) lives in ProviderProfile /
    PatientProfile, linked 1:1 to a User.
    """
    __tablename__ = "users"

    user_id = Column(String, primary_key=True, default=lambda: gen_id("user"))
    username = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=True)
    phone_number = Column(String, unique=True, nullable=True)  # for SMS/voice, and patient login
    password_hash = Column(String, nullable=True)  # set for patient signup + admin-issued provider accounts
    role = Column(Enum(Role), nullable=False)
    external_idp_subject = Column(String, unique=True, nullable=True)  # dev-login / OIDC subject
    created_at = Column(DateTime, default=datetime.utcnow)

    provider_profile = relationship(
        "ProviderProfile", back_populates="user", uselist=False, foreign_keys="ProviderProfile.user_id"
    )
    patient_profile = relationship("PatientProfile", back_populates="user", uselist=False)


class ProviderApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ProviderProfile(Base):
    __tablename__ = "provider_profiles"

    provider_id = Column(String, primary_key=True, default=lambda: gen_id("prov"))
    user_id = Column(String, ForeignKey("users.user_id"), unique=True, nullable=False)
    specialty = Column(String, nullable=False)  # e.g. "internal_medicine", "dermatology"
    bio = Column(Text, nullable=True)
    languages = Column(String, nullable=True)  # comma-separated for simplicity in Phase 1
    accepting_new_cases = Column(String, default="true")  # "true"/"false" — simple flag for now

    # Credentials the provider fills in themselves, then submits for
    # admin sign-off. license_number is only ever shown to the
    # provider themselves and admins; experience_summary is the one
    # field patients get to see (in the public directory).
    license_number = Column(String, nullable=True)
    years_experience = Column(Integer, nullable=True)
    experience_summary = Column(Text, nullable=True)

    # A 3:4 portrait photo, stored under /static/provider_photos.
    # Filename carries a fresh random suffix on every upload so
    # browsers never serve a stale cached image after a change, and
    # it updates immediately — unlike the fields above, a new photo
    # does not require admin re-approval to show.
    photo_filename = Column(String, nullable=True)

    # Every create or edit drops back to "pending" until an admin
    # reviews it again — patients only ever see "approved" profiles.
    approval_status = Column(Enum(ProviderApprovalStatus), default=ProviderApprovalStatus.pending, nullable=False)
    rejection_reason = Column(Text, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by_user_id = Column(String, ForeignKey("users.user_id"), nullable=True)

    user = relationship("User", back_populates="provider_profile", foreign_keys=[user_id])

    @property
    def photo_url(self):
        """Built from API_BASE_URL at read time, same swap-later
        pattern as jitsi_join_url — no migration needed if the
        static-file host changes later."""
        if self.photo_filename:
            return f"{API_BASE_URL}/static/{PROVIDER_PHOTO_DIR}/{self.photo_filename}"
        return None


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    patient_id = Column(String, primary_key=True, default=lambda: gen_id("pat"))
    user_id = Column(String, ForeignKey("users.user_id"), unique=True, nullable=False)
    date_of_birth = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    user = relationship("User", back_populates="patient_profile")


class CaseStatus(str, enum.Enum):
    open = "open"
    in_follow_up = "in_follow_up"
    closed = "closed"


class Case(Base):
    """
    The central record everything else (nutrition plans, follow-ups,
    communications) will attach to in later phases.
    """
    __tablename__ = "cases"

    case_id = Column(String, primary_key=True, default=lambda: gen_id("case"))
    patient_id = Column(String, ForeignKey("patient_profiles.patient_id"), nullable=False)
    provider_id = Column(String, ForeignKey("provider_profiles.provider_id"), nullable=False)
    status = Column(Enum(CaseStatus), default=CaseStatus.open, nullable=False)
    reason = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("PatientProfile")
    provider = relationship("ProviderProfile")
    notes = relationship("CaseNote", back_populates="case")
    appointments = relationship("Appointment", back_populates="case")
    prescriptions = relationship("Prescription", back_populates="case")
    triage = relationship("Triage", back_populates="case", uselist=False)


class CaseNote(Base):
    """
    A generic timeline entry on a case. Later phases (nutrition logs,
    follow-up checkpoints, SMS/call records) can either extend this
    or add their own tables that also reference case_id — kept generic
    here so Phase 1 has a working timeline to build on.
    """
    __tablename__ = "case_notes"

    note_id = Column(String, primary_key=True, default=lambda: gen_id("note"))
    case_id = Column(String, ForeignKey("cases.case_id"), nullable=False)
    author_user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    note_type = Column(String, default="general")  # "general", "nutrition", "follow_up", "sms", "call" later
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("Case", back_populates="notes")


class ConsultationType(str, enum.Enum):
    video = "video"
    audio = "audio"
    in_person = "in_person"


class AppointmentStatus(str, enum.Enum):
    requested = "requested"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"


class Appointment(Base):
    """
    A scheduled consultation on a case. Video appointments get a Jitsi
    room auto-generated on request, so the join link is ready as soon
    as the provider confirms — no separate "create meeting" step.
    """
    __tablename__ = "appointments"

    appointment_id = Column(String, primary_key=True, default=lambda: gen_id("appt"))
    case_id = Column(String, ForeignKey("cases.case_id"), nullable=False)
    requested_by_user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    consultation_type = Column(Enum(ConsultationType), nullable=False, default=ConsultationType.video)
    status = Column(Enum(AppointmentStatus), nullable=False, default=AppointmentStatus.requested)
    scheduled_at = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=30)
    jitsi_room_name = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    case = relationship("Case", back_populates="appointments")

    @property
    def jitsi_join_url(self):
        """Built from JITSI_BASE_URL at read time (not stored) so
        swapping to a self-hosted server later needs no migration —
        same swap-later pattern as DATABASE_URL."""
        if self.jitsi_room_name:
            return f"{JITSI_BASE_URL}/{self.jitsi_room_name}"
        return None


class Prescription(Base):
    """
    Issued by the provider on a case, optionally tied to the
    appointment it came out of.
    """
    __tablename__ = "prescriptions"

    prescription_id = Column(String, primary_key=True, default=lambda: gen_id("rx"))
    case_id = Column(String, ForeignKey("cases.case_id"), nullable=False)
    appointment_id = Column(String, ForeignKey("appointments.appointment_id"), nullable=True)
    issued_by_user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    medication_name = Column(String, nullable=False)
    dosage = Column(String, nullable=False)
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("Case", back_populates="prescriptions")
    appointment = relationship("Appointment")


class Triage(Base):
    """
    First-hand intake, started by the patient when a case is opened.
    patient_name / age / symptoms / duration are required at submit
    time; everything else is optional and can be left for the
    provider to fill in and mark complete.
    """
    __tablename__ = "triage_records"

    triage_id = Column(String, primary_key=True, default=lambda: gen_id("triage"))
    case_id = Column(String, ForeignKey("cases.case_id"), unique=True, nullable=False)

    patient_name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    symptoms = Column(Text, nullable=False)
    duration = Column(String, nullable=False)

    severity = Column(String, nullable=True)
    medical_history = Column(Text, nullable=True)
    medications = Column(Text, nullable=True)
    allergies = Column(Text, nullable=True)
    additional_notes = Column(Text, nullable=True)

    is_complete = Column(String, default="false")  # "true"/"false", same convention as accepting_new_cases
    completed_by_user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    case = relationship("Case", back_populates="triage")
