from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.database.db import get_db
from backend.database.models import User, Role, PatientProfile, ProviderProfile
from backend.auth.security import (
    AUTH_MODE,
    create_access_token,
    get_current_user,
    require_role,
    hash_password,
    verify_password,
)
from backend import schemas

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
