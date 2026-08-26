"""Imports all models so Base.metadata is fully populated for Alembic autogenerate."""

from app.db.base_class import Base
from app.models import (  # noqa: F401
    AssistantProfile,
    Conversation,
    KnowledgeChunk,
    KnowledgeEntity,
    KnowledgeRelationship,
    KnowledgeSource,
    LLMCredential,
    MCPServer,
    MemoryEntry,
    Message,
    PendingToolConfirmation,
    ScheduledTask,
    User,
)

__all__ = ["Base"]
