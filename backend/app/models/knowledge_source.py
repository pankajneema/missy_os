import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SourceType(str, enum.Enum):
    file = "file"
    url = "url"
    text = "text"


class SourceStatus(str, enum.Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class KnowledgeSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_sources"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[SourceType] = mapped_column(Enum(SourceType, name="knowledge_source_type"), nullable=False)
    original_reference: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    status: Mapped[SourceStatus] = mapped_column(
        Enum(SourceStatus, name="knowledge_source_status"), nullable=False, default=SourceStatus.processing
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    chunks: Mapped[list["KnowledgeChunk"]] = relationship(
        back_populates="source", cascade="all, delete-orphan", order_by="KnowledgeChunk.chunk_index"
    )
