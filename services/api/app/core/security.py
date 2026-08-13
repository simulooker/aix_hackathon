from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db

# auth.py에서 로그인 실패 제한 관리에 사용하는 변수
FAILED_ATTEMPTS: dict[str, dict[str, Any]] = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """평문 비밀번호와 해시된 비밀번호 검증 (72바이트 초과 처리 및 bcrypt 직접 사용)"""
    try:
        pwd_bytes = plain_password.encode()[:72]
        hash_bytes = hashed_password.encode()
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except (TypeError, ValueError):
        return False


def get_password_hash(password: str) -> str:
    """비밀번호 암호화 (bcrypt 직접 사용)"""
    pwd_bytes = password.encode()[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode()


def create_access_token(
    data: dict[str, Any], expires_delta: timedelta | None = None
) -> str:
    """JWT 액세스 토큰 생성"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.access_token_expire_minutes
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.secret_key, algorithm=settings.algorithm
    )
    return encoded_jwt


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
):
    """현재 로그인한 사용자 인증 및 사용자 객체 반환"""
    from app.models.user import User  # 순환 임포트 방지

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="자격 증명을 검증할 수 없습니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user
