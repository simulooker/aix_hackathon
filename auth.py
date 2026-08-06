import os
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jwt import PyJWTError, decode, encode
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# ==========================================
# 0. .env 환경변수 로드
# ==========================================
load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError(".env 파일에서 DATABASE_URL을 찾을 수 없습니다!")
if not SECRET_KEY:
    raise ValueError(".env 파일에서 SECRET_KEY를 찾을 수 없습니다!")


# ==========================================
# 1. DB 설정 (Supabase PostgreSQL 사용)
# ==========================================
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# 2. 로그인 실패 및 계정 잠금 관리 (메모리 방식)
# ==========================================
# username별 실패 횟수 및 잠금 해제 시간 저장
# 구조: {"username": {"count": 3, "lock_until": datetime}}
FAILED_ATTEMPTS: Dict[str, dict] = {}

MAX_FAILED_ATTEMPTS = 5  # 최대 허용 실패 횟수
LOCKOUT_MINUTES = 15  # 차단 시간 (15분)


# ==========================================
# 3. FastAPI 앱 및 기본 설정
# ==========================================
app = FastAPI(title="FastAPI 인증 (로그인 실패 제한 추가)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


# ==========================================
# 4. 비밀번호 유효성 검사 공통 함수
# ==========================================
def validate_password_strength(password: str) -> str:
    if len(password) < 8:
        raise ValueError("비밀번호는 최소 8자 이상이어야 합니다.")
    if not re.search(r"\d", password):
        raise ValueError("비밀번호에는 최소 1개 이상의 숫자가 포함되어야 합니다.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise ValueError(
            "비밀번호에는 최소 1개 이상의 특수문자(!@#$%^&* 등)가 포함되어야 합니다."
        )
    return password


# ==========================================
# 5. Pydantic 스키마 정의
# ==========================================
class UserRegister(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return validate_password_strength(v)


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


# ==========================================
# 6. 헬퍼 함수
# ==========================================
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="자격 증명을 검증할 수 없습니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except PyJWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


# ==========================================
# 7. API 엔드포인트
# ==========================================


# 1. 회원가입 API
@app.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
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


# 2. 로그인 API (실패 제한 로직 적용)
@app.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    username = form_data.username
    now = datetime.now(timezone.utc)

    # --- [1] 잠금 여부 확인 ---
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
            # 잠금 시간이 지났으면 카운트 초기화
            FAILED_ATTEMPTS[username] = {"count": 0, "lock_until": None}

    # DB 사용자 확인 및 비밀번호 검증
    user = db.query(User).filter(User.username == username).first()

    # --- [2] 로그인 실패 처리 ---
    if not user or not verify_password(form_data.password, user.hashed_password):
        if username not in FAILED_ATTEMPTS:
            FAILED_ATTEMPTS[username] = {"count": 0, "lock_until": None}

        FAILED_ATTEMPTS[username]["count"] += 1
        current_count = FAILED_ATTEMPTS[username]["count"]

        # 5회 연속 실패 시 계정 잠금 설정
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

    # --- [3] 로그인 성공 시 실패 기록 초기화 ---
    FAILED_ATTEMPTS.pop(username, None)

    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


# 3. 내 정보 조회 API
@app.get("/users/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


# 4. 비밀번호 변경 API
@app.put("/users/me/password", status_code=status.HTTP_200_OK)
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


# 5. 회원 탈퇴 API
@app.delete("/users/me", status_code=status.HTTP_200_OK)
def delete_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(current_user)
    db.commit()

    return {"message": f"계정({current_user.username})이 성공적으로 삭제되었습니다."}