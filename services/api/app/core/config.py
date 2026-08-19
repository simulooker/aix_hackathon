from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_report_bucket: str = "hazard-reports"

    database_url: str = "sqlite:///./local.db"
    secret_key: str = "development-only-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    surface_model_path: str = "models/surface-seg-best.pt"
    obstacle_model_path: str = "models/obstacle-detect-best.pt"
    ai_device: str = "cpu"
    ors_api_key: str | None = None
    disaster_api_url: str | None = None
    disaster_api_key: str | None = None
    # 시연용: 값이 있으면 외부 API 대신 이 JSON 파일을 재난 피드로 사용한다.
    # (실제 재난 발생을 기다릴 수 없어 시연이 불가능한 경우에만 사용)
    disaster_demo_file: str | None = None

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        env_ignore_empty=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
