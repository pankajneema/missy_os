import uuid
from datetime import datetime, time

from pydantic import BaseModel, Field, model_validator

from app.models.scheduled_task import ScheduleType


class ScheduledTaskCreateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    schedule_type: ScheduleType
    run_at_time: time | None = None  # daily only - UTC
    interval_hours: int | None = Field(default=None, ge=1, le=168)  # interval only
    # Floor of 5 minutes: the loop wakes once a minute, and anything tighter
    # would mean a fresh agent run (and its token cost) before the previous
    # one has realistically finished.
    interval_minutes: int | None = Field(default=None, ge=5, le=1440)  # interval only

    @model_validator(mode="after")
    def _validate_schedule_fields(self) -> "ScheduledTaskCreateRequest":
        if self.schedule_type == ScheduleType.daily and self.run_at_time is None:
            raise ValueError("A daily task needs a time of day.")
        if self.schedule_type == ScheduleType.interval and not (self.interval_hours or self.interval_minutes):
            raise ValueError("An interval task needs an interval.")
        if self.interval_hours and self.interval_minutes:
            raise ValueError("Give an interval in hours or in minutes, not both.")
        return self


class ScheduledTaskEnabledRequest(BaseModel):
    enabled: bool


class ScheduledTaskResponse(BaseModel):
    id: uuid.UUID
    prompt: str
    schedule_type: ScheduleType
    run_at_time: time | None
    interval_hours: int | None
    interval_minutes: int | None
    next_run_at: datetime
    last_run_at: datetime | None
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}
