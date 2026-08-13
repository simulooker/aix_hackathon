import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from sqlalchemy.orm import Session

from app.core.config import settings
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
    EmailRequest,
    PasswordChange,
    Token,
    UserRegister,
    UserResponse,
    VerifyOTPRequest,
)

router = APIRouter()
otp_store: dict[str, dict[str, object]] = {}


def mail_config() -> ConnectionConfig:
    if not settings.smtp_user or not settings.smtp_password:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="이메일 발송 설정이 필요합니다. 서버의 SMTP_USER와 SMTP_PASSWORD를 확인해 주세요.",
        )
    return ConnectionConfig(
        MAIL_USERNAME=settings.smtp_user,
        MAIL_PASSWORD=settings.smtp_password,
        MAIL_FROM=settings.smtp_user,
        MAIL_FROM_NAME="위드유",
        MAIL_PORT=settings.smtp_port,
        MAIL_SERVER=settings.smtp_host,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


@router.post("/send-otp")
async def send_otp(request: EmailRequest):
    otp_code = f"{random.randint(100000, 999999)}"
    otp_store[str(request.email)] = {
        "code": otp_code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "verified": False,
    }
    message = MessageSchema(
        subject="[위드유] 회원가입 이메일 인증번호",
        recipients=[str(request.email)],
        body=(
            "<div style='font-family:Arial,sans-serif;padding:20px'>"
            "<h2>위드유 회원가입 이메일 인증번호</h2>"
            f"<h1 style='letter-spacing:5px'>{otp_code}</h1>"
            "<p>인증번호는 5분간 유효합니다.</p></div>"
        ),
        subtype=MessageType.html,
    )
    try:
        await FastMail(mail_config()).send_message(message)
    except HTTPException:
        otp_store.pop(str(request.email), None)
        raise
    except Exception as exc:
        otp_store.pop(str(request.email), None)
        raise HTTPException(status_code=500, detail=f"이메일 발송 실패: {exc}") from exc
    return {"message": "인증번호를 이메일로 발송했습니다."}


@router.post("/verify-otp")
def verify_otp(request: VerifyOTPRequest):
    email = str(request.email)
    stored = otp_store.get(email)
    if not stored:
        raise HTTPException(status_code=400, detail="인증번호를 먼저 요청해 주세요.")
    expires_at = stored["expires_at"]
    if not isinstance(expires_at, datetime) or datetime.now(timezone.utc) > expires_at:
        otp_store.pop(email, None)
        raise HTTPException(status_code=400, detail="인증번호가 만료되었습니다.")
    if stored["code"] != request.code.strip():
        raise HTTPException(status_code=400, detail="인증번호가 일치하지 않습니다.")
    stored["verified"] = True
    return {"message": "이메일 인증이 완료되었습니다."}


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    email = str(user_data.email)
    verification = otp_store.get(email)
    if not verification or not verification.get("verified"):
        raise HTTPException(status_code=400, detail="이메일 인증을 먼저 완료해 주세요.")
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 사용자 이름입니다.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="이미 가입된 이메일입니다.")
    
    # 🎯 추가: 새로 회원가입하는 아이디의 이전 실패/잠금 기록 삭제
    FAILED_ATTEMPTS.pop(user_data.username, None)

    user = User(
        username=user_data.username,
        email=email,
        hashed_password=get_password_hash(user_data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    otp_store.pop(email, None)
    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    username = form_data.username
    now = datetime.now(timezone.utc)
    attempt = FAILED_ATTEMPTS.get(username)
    if attempt and attempt.get("lock_until"):
        lock_until = attempt["lock_until"]
        if isinstance(lock_until, datetime) and now < lock_until:
            remaining = max(1, int((lock_until - now).total_seconds() // 60))
            raise HTTPException(status_code=429, detail=f"로그인이 잠겼습니다. {remaining}분 후 다시 시도하세요.")
        FAILED_ATTEMPTS.pop(username, None)

    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        state = FAILED_ATTEMPTS.setdefault(username, {"count": 0, "lock_until": None})
        state["count"] += 1
        if state["count"] >= MAX_FAILED_ATTEMPTS:
            state["lock_until"] = now + timedelta(minutes=LOCKOUT_MINUTES)
            raise HTTPException(status_code=429, detail=f"로그인이 {LOCKOUT_MINUTES}분 동안 잠겼습니다.")
        raise HTTPException(
            status_code=401,
            detail=f"아이디 또는 비밀번호가 올바르지 않습니다. 남은 시도: {MAX_FAILED_ATTEMPTS - state['count']}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    FAILED_ATTEMPTS.pop(username, None)
    return {"access_token": create_access_token({"sub": user.username}), "token_type": "bearer"}


@router.get("/users/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/users/me/password")
def update_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 일치하지 않습니다.")
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    return {"message": "비밀번호가 변경되었습니다."}


@router.delete("/users/me")
def delete_user(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 🎯 추가: 계정 삭제 시 메모리에 남은 실패/잠금 기록 삭제
    FAILED_ATTEMPTS.pop(current_user.username, None)

    db.delete(current_user)
    db.commit()
    return {"message": "계정이 삭제되었습니다."}
