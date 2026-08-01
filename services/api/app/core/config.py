from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --------------------------------------------------
    # 1. 기존 프로젝트 설정 (AI 및 모바일 앱)
    # --------------------------------------------------
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]
    supabase_url: Optional[str] = None
    supabase_service_role_key: Optional[str] = None
    model_path: str = "models/best.pt"

    # --------------------------------------------------
    # 2. 인증 및 DB 설정 (추가된 부분)
    # --------------------------------------------------
    database_url: str  # .env의 DATABASE_URL 읽음
    secret_key: str  # .env의 SECRET_KEY 읽음
    algorithm: str = "HS256"  # .env에 없으면 기본값 HS256 사용
    access_token_expire_minutes: int = 1440  # .env에 없으면 기본값 1440분(24시간) 사용

    # .env 파일 로드 설정 (정의되지 않은 extra 변수는 무시)
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()