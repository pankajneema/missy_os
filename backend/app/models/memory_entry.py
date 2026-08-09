import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.knowledge_chunk import EMBEDDING_DIM


class MemoryCategory(str, enum.Enum):
    fact = "fact"
    preference = "preference"
    episodic = "episodic"


class MemorySource(str, enum.Enum):
    auto = "auto"
    manual = "manual"


class MemoryEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A durable fact/preference Missy has picked up about the user - distinct
    from the knowledge base (documents the user deliberately added). Memory
    is built automatically from conversation and used silently on every turn."""

    __tablename__ = "memory_entries"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[MemoryCategory] = mapped_column(
        Enum(MemoryCategory, name="memory_category"), nullable=False, default=MemoryCategory.fact
    )
    source: Mapped[MemorySource] = mapped_column(Enum(MemorySource, name="memory_source"), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship()
