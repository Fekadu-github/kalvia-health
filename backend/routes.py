import os
import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.database.db import get_db
from backend.database.models import User, Role, PatientProfile, ProviderProfile, ProviderApprovalStatus
from backend.auth.security import (
    AUTH_MODE,
    create_access_token,
    get_current_user,
    require_role,
    hash_password,
    verify_password,
)
from backend.notifications.email import send_email
from backend.notifications.sms import send_sms
from backend import schemas

ADMIN_BOOTSTRAP_SECRET = os.getenv("ADMIN_BOOTSTRAP_SECRET")
RESET_CODE_TTL_MINUTES = 10

router = APIRouter()


@router.post("/auth/dev-login", response_model=schemas.TokenResponse)
def dev_login(payload: schemas.DevLoginRequest, db: Session = Depends(get_db)):
    """
    Admin bootstrap only. Real patient/provider accounts now go
    through /auth/patient/signup and /auth/admin/create-provider —
    this endpoint exists purely to get the first admin account
    without a chicken-and-egg problem.
    """
    if AUTH_MODE != "dev":
        raise HTTPException(403, "Dev login is disabled. Set AUTH_MODE=dev to enable it locally.")
    if payload.role != Role.admin:
        raise HTTPException(
            403,
            "Dev login is admin-only bootstrap access. Patients sign up at "
            "/auth/patient/signup; providers are created by an admin via "
            "/auth/admin/create-provider.",
        )

    user = db.query(User).filter(User.external_idp_subject == payload.external_idp_subject).first()
    if user is None:
        user = User(
            username=payload.username,
            full_name=payload.full_name,
            role=payload.role,
            external_idp_subject=payload.external_idp_subject,
            phone_number=payload.phone_number,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(user.user_id, user.role.value)
    return schemas.TokenResponse(access_token=token, user_id=user.user_id, role=user.role)


@router.post("/auth/patient/signup", response_model=schemas.TokenResponse)
def patient_signup(payload: schemas.PatientSignupRequest, db: Session = Depends(get_db)):
    if not payload.email and not payload.phone_number:
        raise HTTPException(400, "Provide an email or phone number to sign up")

    existing = None
    if payload.email:
        existing = db.query(User).filter(User.email == payload.email).first()
    if not existing and payload.phone_number:
        existing = db.query(User).filter(User.phone_number == payload.phone_number).first()
    if existing:
        raise HTTPException(409, "An account with this email or phone number already exists")

    user = User(
        username=payload.email or payload.phone_number,
        full_name=payload.full_name,
        role=Role.patient,
        email=payload.email,
        phone_number=payload.phone_number,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(PatientProfile(user_id=user.user_id))
    db.commit()

    token = create_access_token(user.user_id, user.role.value)
    return schemas.TokenResponse(access_token=token, user_id=user.user_id, role=user.role)


@router.post("/auth/patient/login", response_model=schemas.TokenResponse)
def patient_login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(User.role == Role.patient)
        .filter(or_(User.email == payload.identifier, User.phone_number == payload.identifier))
        .first()
    )
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email/phone or password")

    token = create_access_token(user.user_id, user.role.value)
    return schemas.TokenResponse(access_token=token, user_id=user.user_id, role=user.role)


@router.post("/auth/provider/login", response_model=schemas.TokenResponse)
def provider_login(payload: schemas.ProviderLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username, User.role == Role.provider).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")

    token = create_access_token(user.user_id, user.role.value)
    return schemas.TokenResponse(access_token=token, user_id=user.user_id, role=user.role)


@router.post("/auth/admin/create-provider", response_model=schemas.ProviderAccountOut)
def create_provider_account(
    payload: schemas.ProviderCreateByAdmin,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(Role.admin)),
):
    """Providers don't self-register — an admin issues the username/
    password and hands it to them out of band."""
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(409, "That username is already taken")

    user = User(
        username=payload.username,
        full_name=payload.full_name,
        role=Role.provider,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # An admin filling this in directly is itself the sign-off, so the
    # profile goes straight to "approved" — no separate review step.
    # (Providers who instead fill in their own profile after logging
    # in go through the pending → admin-approval flow in providers/routes.py.)
    provider_profile = ProviderProfile(
        user_id=user.user_id,
        specialty=payload.specialty,
        bio=payload.bio,
        languages=payload.languages,
        license_number=payload.license_number,
        years_experience=payload.years_experience,
        experience_summary=payload.experience_summary,
        approval_status=ProviderApprovalStatus.approved,
        approved_at=datetime.utcnow(),
        approved_by_user_id=admin.user_id,
    )
    db.add(provider_profile)
    db.commit()

    return schemas.ProviderAccountOut(
        username=user.username, full_name=user.full_name, provider_id=provider_profile.provider_id
    )


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "user_id": user.user_id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "email": user.email,
        "phone_number": user.phone_number,
    }


@router.post("/auth/admin/bootstrap", response_model=schemas.TokenResponse)
def admin_bootstrap(payload: schemas.AdminBootstrapRequest, db: Session = Depends(get_db)):
    """Creates the first admin account. Requires ADMIN_BOOTSTRAP_SECRET
    to be set on the server and matched exactly, and only works while
    no admin account exists yet — once one does, this always 403s, so
    the secret can't be used to mint extra admins later."""
    if not ADMIN_BOOTSTRAP_SECRET:
        raise HTTPException(403, "Admin bootstrap is disabled — ADMIN_BOOTSTRAP_SECRET is not set on the server.")
    if payload.bootstrap_secret != ADMIN_BOOTSTRAP_SECRET:
        raise HTTPException(403, "Incorrect bootstrap secret.")

    existing_admin = db.query(User).filter(User.role == Role.admin).first()
    if existing_admin:
        raise HTTPException(403, "An admin account already exists. Use /auth/admin/login instead.")

    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(400, "That username is already taken.")

    user = User(
        username=payload.username,
        full_name=payload.full_name,
        role=Role.admin,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.role.value)
    return schemas.TokenResponse(access_token=token, user_id=user.user_id, role=user.role)


@router.post("/auth/admin/login", response_model=schemas.TokenResponse)
def admin_login(payload: schemas.AdminLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username, User.role == Role.admin).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")

    token = create_access_token(user.user_id, user.role.value)
    return schemas.TokenResponse(access_token=token, user_id=user.user_id, role=user.role)


def _find_user_by_identifier(db: Session, identifier: str) -> User | None:
    return (
        db.query(User)
        .filter(or_(User.username == identifier, User.email == identifier, User.phone_number == identifier))
        .first()
    )


@router.post("/auth/password/request-reset", response_model=schemas.MessageResponse)
def request_password_reset(payload: schemas.PasswordResetRequest, db: Session = Depends(get_db)):
    """Always returns the same generic message whether or not the
    identifier matched an account, so this can't be used to check
    which usernames/emails/phone numbers exist."""
    user = _find_user_by_identifier(db, payload.identifier)
    if user and user.password_hash:  # only accounts with a password can reset one (skips dev/OIDC-only accounts)
        code = f"{random.randint(0, 999999):06d}"
        user.reset_code = code
        user.reset_code_expires_at = datetime.utcnow() + timedelta(minutes=RESET_CODE_TTL_MINUTES)
        db.commit()

        body = f"Your Kalvia Health password reset code is {code}. It expires in {RESET_CODE_TTL_MINUTES} minutes."
        if user.email:
            send_email(user.email, "Your Kalvia Health reset code", body)
        elif user.phone_number:
            send_sms(user.phone_number, body)

    return schemas.MessageResponse(
        message="If an account matches, a 6-digit code has been sent to it."
    )


@router.post("/auth/password/confirm-reset", response_model=schemas.TokenResponse)
def confirm_password_reset(payload: schemas.PasswordResetConfirmRequest, db: Session = Depends(get_db)):
    user = _find_user_by_identifier(db, payload.identifier)
    if (
        not user
        or not user.reset_code
        or user.reset_code != payload.code
        or not user.reset_code_expires_at
        or user.reset_code_expires_at < datetime.utcnow()
    ):
        raise HTTPException(400, "That code is invalid or has expired.")

    user.password_hash = hash_password(payload.new_password)
    user.reset_code = None
    user.reset_code_expires_at = None
    db.commit()
    db.refresh(user)

    token = create_access_token(user.user_id, user.role.value)
    return schemas.TokenResponse(access_token=token, user_id=user.user_id, role=user.role)
