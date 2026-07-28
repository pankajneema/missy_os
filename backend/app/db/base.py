"""Imports all models so Base.metadata is fully populated for Alembic autogenerate."""

from app.db.base_class import Base
from app.models import (  # noqa: F401
    AssistantProfile,
    Conversation,
    KnowledgeChunk,
    KnowledgeSource,
    LLMCredential,
    Message,
    User,
)

__all__ = ["Base"]
