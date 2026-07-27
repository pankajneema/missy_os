import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AssistantProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assistant_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    assistant_name: Mapped[str] = mapped_column(String(64), nullable=False, default="Missy")
    persona_description: Mapped[str] = mapped_column(Text, nullable=False)
    user_about_me: Mapped[str] = mapped_column(Text, nullable=False)
    tone_preference: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped["User"] = relationship(back_populates="profile")
