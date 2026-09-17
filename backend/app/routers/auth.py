from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth import (
    COOKIE_NAME,
    AdminUser,
    CurrentUser,
    create_access_token,
    hash_password,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_cookie_kwargs() -> dict:
    secure = settings.cookie_secure
    return {
        "httponly": True,
        "secure": secure,
        "samesite": "none" if secure else "lax",
    }


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user.email)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.jwt_expire_minutes * 60,
        **_auth_cookie_kwargs(),
    )
    return TokenResponse()


@router.post("/logout", response_model=TokenResponse)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, **_auth_cookie_kwargs())
    return TokenResponse(message="logged out")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, _admin: AdminUser, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(_admin: AdminUser, db: Session = Depends(get_db)):
    return db.query(User).order_by(User.display_name).all()
