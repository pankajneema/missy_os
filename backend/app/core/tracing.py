import os

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def configure_tracing() -> None:
    """Bridges our Settings (loaded from .env via pydantic-settings) into the
    real process environment LangChain's tracer reads directly - pydantic-
    settings populates Settings fields from .env, it does not touch
    os.environ itself, so LangSmith would never see these otherwise.

    With no API key configured this is a no-op: every chat model, tool, and
    graph call already runs through LangChain's Runnable interface, so
    tracing needs no other code changes once this is set - only whether it's
    switched on."""
    settings = get_settings()
    if not settings.langsmith_api_key:
        logger.info("LangSmith tracing not configured (no LANGSMITH_API_KEY) - skipping")
        return

    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
    logger.info("LangSmith tracing enabled for project '%s'", settings.langsmith_project)
