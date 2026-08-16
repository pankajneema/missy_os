from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+psycopg2://missy:missy@localhost:5432/missy_os"

    # JWT
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Encryption for user-supplied LLM API keys (Fernet key, generate with cryptography.fernet.Fernet.generate_key())
    fernet_key: str

    # CORS - Streamlit runs on a different port than FastAPI
    allowed_origins: list[str] = ["http://localhost:8501"]

    # LangSmith tracing (optional) - an operator-level setting, not a
    # per-user credential, so it lives here rather than in API Connections.
    # Sign up at smith.langchain.com, create an API key, and set it below to
    # enable tracing; leave unset and nothing changes (off by default).
    langsmith_api_key: str | None = None
    langsmith_project: str = "missy-os"


@lru_cache
def get_settings() -> Settings:
    return Settings()
