import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class KnowledgeEntity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A named thing (technology, product, person, organization, concept)
    extracted from ingested documents - the node type of the knowledge
    graph. One entity can be linked from relationships extracted out of
    several different documents; app/repositories/knowledge_graph_repo.py's
    get_or_create_entity is what keeps mentions of the same name from
    splitting into duplicate nodes."""

    __tablename__ = "knowledge_entities"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_entity_name"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship()
