import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Conversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "conversations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False, default="New Chat")

    # Compressed context for everything up through summarized_through_message_id
    # (see app/services/conversation_summary_service.py) - purely additive to
    # what gets SENT to the model on future turns. The `messages` table below
    # is never touched by compression: every raw message stays forever, so
    # the REST API and any history view keep showing everything, always.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summarized_through_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
        foreign_keys="Message.conversation_id",
    )
