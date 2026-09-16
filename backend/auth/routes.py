import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.database.db import get_db
from backend.database.models import User, Role, PatientProfile, ProviderProfile, PasswordReset
from backend.auth.security import (
    AUTH_MODE,
    create_access_token,
    get_current_user,
    require_role,
    hash_password,
    verify_password,
)
from backend import schemas
from backend.notifications.email import send_email
from backend.notifications.sms import send_sms

router = APIRouter()

ADMIN_BOOTSTRAP_SECRET = os.getenv("ADMIN_BOOTSTRAP_SECRET")
RESET_CODE_EXPIRE_MINUTES = 15


@router.post("/auth/dev-login", response_model=schemas.TokenResponse)
def dev_login(payload: schemas.DevLoginRequest, db: Session = Depends(get_db)):
    """
    Local/dev convenience only — lets you get a token for a patient,
    provider, or call-center-staff role without going through the
    real signup/login forms while developing. It can never issue an
    admin token; admins are created via /auth/admin/bootstrap or by
    an existing admin, and always require a real password.
    """
    if AUTH_MODE != "dev":
        raise HTTPException(403, "Dev login is disabled. Set AUTH_MODE=dev to enable it locally.")
    if payload.role == Role.admin:
        raise HTTPException(
            403,
            "Dev login can't issue admin access. Use /auth/admin/bootstrap "
            "(one-time, secret-gated) or /auth/admin/login instead.",
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


@router.post("/auth/admin/bootstrap", response_model=schemas.TokenResponse)
def admin_bootstrap(payload: schemas.AdminBootstrapRequest, db: Session = Depends(get_db)):
    """
    Creates the very first admin account. Gated two ways, both of
    which must hold:
      1. The caller must supply ADMIN_BOOTSTRAP_SECRET (an env var
         only you set on Render — never in frontend code).
      2. It only works while zero admin accounts exist yet. Once
         the first admin is created, this endpoint permanently
         refuses — even with the correct secret — so a leaked
         secret later can't be used to mint a second rogue admin.
         Additional admins are created by an existing admin via
         /auth/admin/create-admin instead.
    """
    if not ADMIN_BOOTSTRAP_SECRET:
        raise HTTPException(403, "Admin bootstrap is not configured on this server.")
    if payload.bootstrap_secret != ADMIN_BOOTSTRAP_SECRET:
        raise HTTPException(403, "Invalid bootstrap secret.")

    existing_admin_count = db.query(User).filter(User.role == Role.admin).count()
    if existing_admin_count > 0:
        raise HTTPException(
            403,
            "An admin account already exists. Ask an existing admin to create "
            "additional admin accounts via /auth/admin/create-admin.",
        )
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(409, "That username is already taken.")

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


@router.post("/auth/admin/create-admin", response_model=schemas.ProviderAccountOut)
def create_admin_account(
    payload: schemas.AdminCreateAdmin,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(Role.admin)),
):
    """An existing admin, authenticated, can create further admin accounts."""
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(409, "That username is already taken")

    user = User(
        username=payload.username,
        full_name=payload.full_name,
        role=Role.admin,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return schemas.ProviderAccountOut(username=user.username, full_name=user.full_name, provider_id=user.user_id)


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

    provider_profile = ProviderProfile(
        user_id=user.user_id,
        specialty=payload.specialty,
        bio=payload.bio,
        languages=payload.languages,
    )
    db.add(provider_profile)
    db.commit()

    return schemas.ProviderAccountOut(
        username=user.username, full_name=user.full_name, provider_id=provider_profile.provider_id
    )


@router.post("/auth/password-reset/request")
def request_password_reset(payload: schemas.PasswordResetRequest, db: Session = Depends(get_db)):
    """
    Always returns the same generic message, whether or not an
    account matched — this avoids leaking which emails/phones/
    usernames have accounts. If a match is found, a 6-digit code
    is generated, hashed before storing (so a DB read alone can't
    be used to reset the password), and sent to whichever contact
    method the account has on file.
    """
    user = (
        db.query(User)
        .filter(
            or_(
                User.email == payload.identifier,
                User.phone_number == payload.identifier,
                User.username == payload.identifier,
            )
        )
        .first()
    )

    generic_response = {"message": "If an account matches, a reset code has been sent."}

    if user is None:
        return generic_response

    code = f"{secrets.randbelow(1_000_000):06d}"
    reset = PasswordReset(
        user_id=user.user_id,
        code_hash=hash_password(code),
        expires_at=datetime.utcnow() + timedelta(minutes=RESET_CODE_EXPIRE_MINUTES),
    )
    db.add(reset)
    db.commit()

    body = f"Your Kalvia Health password reset code is {code}. It expires in {RESET_CODE_EXPIRE_MINUTES} minutes."
    if user.email:
        send_email(user.email, "Kalvia Health password reset", body)
    elif user.phone_number:
        send_sms(user.phone_number, body)

    return generic_response


@router.post("/auth/password-reset/confirm", response_model=schemas.TokenResponse)
def confirm_password_reset(payload: schemas.PasswordResetConfirm, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(
            or_(
                User.email == payload.identifier,
                User.phone_number == payload.identifier,
                User.username == payload.identifier,
            )
        )
        .first()
    )
    if user is None:
        raise HTTPException(400, "Invalid or expired code")

    candidates = (
        db.query(PasswordReset)
        .filter(PasswordReset.user_id == user.user_id, PasswordReset.used == "false")
        .filter(PasswordReset.expires_at >= datetime.utcnow())
        .order_by(PasswordReset.created_at.desc())
        .all()
    )
    match = next((r for r in candidates if verify_password(payload.code, r.code_hash)), None)
    if match is None:
        raise HTTPException(400, "Invalid or expired code")

    match.used = "true"
    user.password_hash = hash_password(payload.new_password)
    db.commit()

    token = create_access_token(user.user_id, user.role.value)
    return schemas.TokenResponse(access_token=token, user_id=user.user_id, role=user.role)


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
