import uuid
from datetime import datetime, time

from pydantic import BaseModel, Field, model_validator

from app.models.scheduled_task import ScheduleType


class ScheduledTaskCreateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    schedule_type: ScheduleType
    run_at_time: time | None = None  # daily only - UTC
    interval_hours: int | None = Field(default=None, ge=1, le=168)  # interval only

    @model_validator(mode="after")
    def _validate_schedule_fields(self) -> "ScheduledTaskCreateRequest":
        if self.schedule_type == ScheduleType.daily and self.run_at_time is None:
            raise ValueError("A daily task needs a time of day.")
        if self.schedule_type == ScheduleType.interval and not self.interval_hours:
            raise ValueError("An interval task needs an hour count.")
        return self


class ScheduledTaskEnabledRequest(BaseModel):
    enabled: bool


class ScheduledTaskResponse(BaseModel):
    id: uuid.UUID
    prompt: str
    schedule_type: ScheduleType
    run_at_time: time | None
    interval_hours: int | None
    next_run_at: datetime
    last_run_at: datetime | None
    enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}
