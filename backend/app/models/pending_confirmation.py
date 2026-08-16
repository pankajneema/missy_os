import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.llm_credential import LLMProvider


class PendingToolConfirmation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A risky tool call (write/delete/move - see app/ai/graph.py's
    _is_risky) that's paused mid-turn awaiting the user's approval. The
    LangGraph checkpointer (a separate set of tables) holds the actual
    paused execution state, keyed by thread_id - this row is just a
    lightweight pointer to it, findable per-conversation."""

    __tablename__ = "pending_tool_confirmations"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    user_message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    thread_id: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[LLMProvider] = mapped_column(Enum(LLMProvider, name="llm_provider"), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(256), nullable=False)
    tool_args: Mapped[dict] = mapped_column(JSONB, nullable=False)

    conversation: Mapped["Conversation"] = relationship()
    user_message: Mapped["Message"] = relationship()
