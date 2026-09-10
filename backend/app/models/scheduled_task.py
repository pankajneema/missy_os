import enum
import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ScheduleType(str, enum.Enum):
    daily = "daily"  # runs once a day at run_at_time (UTC)
    interval = "interval"  # runs every interval_minutes (or interval_hours)


class ScheduledTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A prompt that runs on its own, unattended, through the same LangGraph
    agent as a normal chat turn - see app/services/scheduled_task_service.py
    and the background loop in app/core/scheduler.py. Results land as
    messages in a dedicated per-user conversation rather than any kind of
    push notification, so there's nowhere to click "approve" on a risky tool
    call - those get auto-denied instead (build_graph's unattended=True)."""

    __tablename__ = "scheduled_tasks"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    schedule_type: Mapped[ScheduleType] = mapped_column(Enum(ScheduleType, name="schedule_type"), nullable=False)

    # daily only
    run_at_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    # interval only - a task carries one of these, not both. interval_minutes
    # came later so that a job can run more often than hourly; the scheduler
    # loop already ticks every 60 seconds, so nothing else had to change.
    interval_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interval_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship()
