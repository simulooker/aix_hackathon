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

# 💡 임시 인증번호 저장소
otp_store = {}

# FastAPI-Mail 설정
conf = ConnectionConfig(
    MAIL_USERNAME=settings.smtp_user,
    MAIL_PASSWORD=settings.smtp_password,
    MAIL_FROM=settings.smtp_user,
    MAIL_PORT=settings.smtp_port,
    MAIL_SERVER=settings.smtp_host,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
)


# --------------------------------------------------
# 📧 이메일 인증번호(OTP) API
# --------------------------------------------------
@router.post("/send-otp")
async def send_otp(request: EmailRequest):
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    otp_store[request.email] = {
        "code": otp_code,
        "expires_at": expires_at,
        "verified": False,
    }

    html_content = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>[AIX Hackathon] 회원가입 이메일 인증번호</h2>
        <p>아래 6자리 인증번호를 회원가입 화면에 입력해 주세요.</p>
        <h1 style="color: #4CAF50; letter-spacing: 5px;">{otp_code}</h1>
        <p>이 인증번호는 <strong>5분간 유효</strong>합니다.</p>
    </div>
    """

    message = MessageSchema(
        subject="[AIX Hackathon] 회원가입 이메일 인증번호입니다.",
        recipients=[request.email],
        body=html_content,
        subtype=MessageType.html,
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
        return {"message": "인증번호가 이메일로 성공적으로 발송되었습니다."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"이메일 발송 실패: {str(e)}",
        )


@router.post("/verify-otp")
def verify_otp(request: VerifyOTPRequest):
    stored_data = otp_store.get(request.email)

    if not stored_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인증번호를 먼저 요청해 주세요.",
        )

    if datetime.now(timezone.utc) > stored_data["expires_at"]:
        del otp_store[request.email]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인증번호가 만료되었습니다. 다시 요청해 주세요.",
        )

    if stored_data["code"] != request.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="인증번호가 일치하지 않습니다.",
        )

    otp_store[request.email]["verified"] = True
    return {"message": "이메일 인증이 성공적으로 완료되었습니다."}


# --------------------------------------------------
# 🔑 계정 및 인증 API (수정된 register 포함)
# --------------------------------------------------
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    # 1. 회원가입 시 이메일 필수 체크
    if not user_data.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="회원가입을 위해 이메일 주소가 필요합니다.",
        )

    # 2. 이메일 인증 완료 검증 🔒
    email_data = otp_store.get(user_data.email)
    if not email_data or not email_data.get("verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이메일 인증이 완료되지 않았습니다. 먼저 이메일 인증을 진행해 주세요.",
        )

    # 3. 사용자 이름(username) 중복 체크
    db_user = db.query(User).filter(User.username == user_data.username).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 존재하는 사용자 이름입니다.",
        )

    # 4. 이메일(email) 중복 체크
    db_email = db.query(User).filter(User.email == user_data.email).first()
    if db_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 가입된 이메일 주소입니다.",
        )

    # 5. 비밀번호 해싱 및 사용자 생성
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 6. 회원가입 완료 후 임시 인증 세션 삭제
    otp_store.pop(user_data.email, None)

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