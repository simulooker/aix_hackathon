from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import UserRegister, UserResponse, Token, PasswordChange
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    FAILED_ATTEMPTS,
    MAX_FAILED_ATTEMPTS,
    LOCKOUT_MINUTES,
)

# 🔻 이 줄이 반드시 들어있어야 router 에러가 안 납니다!
router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user_data.username).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 존재하는 사용자 이름입니다.",
        )

    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    username = form_data.username
    now = datetime.now(timezone.utc)

    user_attempt = FAILED_ATTEMPTS.get(username)
    if user_attempt and user_attempt.get("lock_until"):
        if now < user_attempt["lock_until"]:
            remaining_seconds = int((user_attempt["lock_until"] - now).total_seconds())
            remaining_minutes = max(1, remaining_seconds // 60)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"비밀번호를 {MAX_FAILED_ATTEMPTS}회 이상 틀려 계정이 잠겼습니다. 약 {remaining_minutes}분 후 다시 시도해 주세요.",
            )
        else:
            FAILED_ATTEMPTS[username] = {"count": 0, "lock_until": None}

    user = db.query(User).filter(User.username == username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        if username not in FAILED_ATTEMPTS:
            FAILED_ATTEMPTS[username] = {"count": 0, "lock_until": None}

        FAILED_ATTEMPTS[username]["count"] += 1
        current_count = FAILED_ATTEMPTS[username]["count"]

        if current_count >= MAX_FAILED_ATTEMPTS:
            lock_time = now + timedelta(minutes=LOCKOUT_MINUTES)
            FAILED_ATTEMPTS[username]["lock_until"] = lock_time
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"비밀번호를 {MAX_FAILED_ATTEMPTS}회 연속으로 틀렸습니다. {LOCKOUT_MINUTES}분 동안 로그인이 제한됩니다.",
            )

        remaining_attempts = MAX_FAILED_ATTEMPTS - current_count
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"아이디 또는 비밀번호가 올바르지 않습니다. (남은 시도 횟수: {remaining_attempts}회)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    FAILED_ATTEMPTS.pop(username, None)
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/users/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/users/me/password", status_code=status.HTTP_200_OK)
def update_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(
        password_data.current_password, current_user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="현재 비밀번호가 일치하지 않습니다.",
        )

    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    return {"message": "비밀번호가 성공적으로 변경되었습니다."}

@router.delete("/users/me", status_code=status.HTTP_200_OK)
def delete_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(current_user)
    db.commit()
    return {"message": f"계정({current_user.username})이 성공적으로 삭제되었습니다."}