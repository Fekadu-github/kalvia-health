from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import User
from backend.auth.security import AUTH_MODE, create_access_token, get_current_user
from backend import schemas

router = APIRouter()


@router.post("/auth/dev-login", response_model=schemas.TokenResponse)
def dev_login(payload: schemas.DevLoginRequest, db: Session = Depends(get_db)):
    if AUTH_MODE != "dev":
        raise HTTPException(403, "Dev login is disabled. Set AUTH_MODE=dev to enable it locally.")

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


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "user_id": user.user_id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "phone_number": user.phone_number,
    }
