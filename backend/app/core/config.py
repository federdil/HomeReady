from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    anthropic_api_key: str
    database_url: str
    supabase_url: str
    supabase_service_key: str
    supabase_jwt_secret: str = ""
    environment: str = "development"
    cors_origins: str = "http://localhost:5173"
    secret_key: str = "change-me"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
