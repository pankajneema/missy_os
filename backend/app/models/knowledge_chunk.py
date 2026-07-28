import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin

# all-MiniLM-L6-v2 (our local embedding model) produces 384-dim vectors.
EMBEDDING_DIM = 384


class KnowledgeChunk(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_chunks"

    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)

    source: Mapped["KnowledgeSource"] = relationship(back_populates="chunks")
