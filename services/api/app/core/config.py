from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --------------------------------------------------
    # 1. 기존 프로젝트 설정 (AI 및 모바일 앱)
    # --------------------------------------------------
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    model_path: str = "models/best.pt"

    # --------------------------------------------------
    # 2. 인증 및 DB 설정
    # --------------------------------------------------
    database_url: str  # .env의 DATABASE_URL 읽음
    secret_key: str  # .env의 SECRET_KEY 읽음
    algorithm: str = "HS256"  # 기본값 HS256
    access_token_expire_minutes: int = 1440  # 기본값 1440분(24시간)

    # --------------------------------------------------
    # 3. SMTP 이메일 발송 설정 (신규 추가)
    # --------------------------------------------------
    smtp_host: str = "smtp.gmail.com"  # .env의 SMTP_HOST 읽음 (기본값 제공)
    smtp_port: int = 587              # .env의 SMTP_PORT 읽음
    smtp_user: str | None = None   # .env의 SMTP_USER 읽음
    smtp_password: str | None = None  # .env의 SMTP_PASSWORD 읽음

    # .env 파일 로드 설정 (정의되지 않은 extra 변수는 무시, 대소문자 구별 안함)
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        env_ignore_empty=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()