import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class KnowledgeRelationship(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A directed edge between two KnowledgeEntity nodes (the graph's edge
    type), e.g. "MinIO --[used for]--> object storage". Tied back to the
    specific document it was extracted from, so a source's relationships
    can be cleaned up if the source itself is deleted."""

    __tablename__ = "knowledge_relationships"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_entities.id", ondelete="CASCADE"), nullable=False
    )
    target_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_entities.id", ondelete="CASCADE"), nullable=False
    )
    relationship_type: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False
    )

    user: Mapped["User"] = relationship()
    source_entity: Mapped["KnowledgeEntity"] = relationship(foreign_keys=[source_entity_id])
    target_entity: Mapped["KnowledgeEntity"] = relationship(foreign_keys=[target_entity_id])
