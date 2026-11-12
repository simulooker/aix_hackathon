from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import (
    FAILED_ATTEMPTS,
    LOCKOUT_MINUTES,
    MAX_FAILED_ATTEMPTS,
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    PasswordChange,
    Token,
    UserRegister,
    UserResponse,
)

router = APIRouter()
DatabaseSession = Annotated[Session, Depends(get_db)]
LoginForm = Annotated[OAuth2PasswordRequestForm, Depends()]
AuthenticatedUser = Annotated[User, Depends(get_current_user)]


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
def register(user_data: UserRegister, db: DatabaseSession):
    email = str(user_data.email)
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 사용자 이름입니다.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="이미 가입된 이메일입니다.")
    FAILED_ATTEMPTS.pop(user_data.username, None)

    user = User(
        username=user_data.username,
        email=email,
        hashed_password=get_password_hash(user_data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(form_data: LoginForm, db: DatabaseSession):
    username = form_data.username
    now = datetime.now(timezone.utc)
    attempt = FAILED_ATTEMPTS.get(username)
    if attempt and attempt.get("lock_until"):
        lock_until = attempt["lock_until"]
        if isinstance(lock_until, datetime) and now < lock_until:
            remaining = max(1, int((lock_until - now).total_seconds() // 60))
            raise HTTPException(
                status_code=429,
                detail=f"로그인이 잠겼습니다. {remaining}분 후 다시 시도하세요.",
            )
        FAILED_ATTEMPTS.pop(username, None)

    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        state = FAILED_ATTEMPTS.setdefault(username, {"count": 0, "lock_until": None})
        state["count"] += 1
        if state["count"] >= MAX_FAILED_ATTEMPTS:
            state["lock_until"] = now + timedelta(minutes=LOCKOUT_MINUTES)
            raise HTTPException(
                status_code=429, detail=f"로그인이 {LOCKOUT_MINUTES}분 동안 잠겼습니다."
            )
        raise HTTPException(
            status_code=401,
            detail=f"아이디 또는 비밀번호가 올바르지 않습니다. 남은 시도: {MAX_FAILED_ATTEMPTS - state['count']}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    FAILED_ATTEMPTS.pop(username, None)
    return {
        "access_token": create_access_token({"sub": user.username}),
        "token_type": "bearer",
    }


@router.get("/users/me", response_model=UserResponse)
def read_users_me(current_user: AuthenticatedUser):
    return current_user


@router.put("/users/me/password")
def update_password(
    password_data: PasswordChange,
    current_user: AuthenticatedUser,
    db: DatabaseSession,
):
    if not verify_password(
        password_data.current_password, current_user.hashed_password
    ):
        raise HTTPException(
            status_code=400, detail="현재 비밀번호가 일치하지 않습니다."
        )
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    return {"message": "비밀번호가 변경되었습니다."}


@router.delete("/users/me")
def delete_user(current_user: AuthenticatedUser, db: DatabaseSession):
    FAILED_ATTEMPTS.pop(current_user.username, None)

    db.delete(current_user)
    db.commit()
    return {"message": "계정이 삭제되었습니다."}
