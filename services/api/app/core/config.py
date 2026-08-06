from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    database_url: str = "sqlite:///./local.db"
    secret_key: str = "development-only-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    surface_model_path: str = "models/surface-seg-best.pt"
    obstacle_model_path: str = "models/obstacle-detect-best.pt"
    ai_device: str = "cpu"

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
