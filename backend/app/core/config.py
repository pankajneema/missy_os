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

    # An MCP stdio server (app/services/mcp_service.py) runs an arbitrary
    # local command with this backend's own OS privileges, on behalf of
    # whichever account configured it - any account, not just the
    # operator's. Off by default: only the person with .env access can
    # enable it, so a code-level boundary exists regardless of how many
    # accounts can log in.
    allow_mcp_stdio_servers: bool = False

    # LangSmith tracing (optional) - an operator-level setting, not a
    # per-user credential, so it lives here rather than in API Connections.
    # Sign up at smith.langchain.com, create an API key, and set it below to
    # enable tracing; leave unset and nothing changes (off by default).
    langsmith_api_key: str | None = None
    langsmith_project: str = "missy-os"


@lru_cache
def get_settings() -> Settings:
    return Settings()
