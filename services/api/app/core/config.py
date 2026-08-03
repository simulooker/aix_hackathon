from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:19006"]
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_hazard_bucket: str = "hazard-photos"
    model_path: str = "models/best.pt"
    weather_api_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
