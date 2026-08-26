import uuid
from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.scheduled_task import ScheduledTask, ScheduleType


def list_by_user(db: Session, user_id: uuid.UUID) -> list[ScheduledTask]:
    return list(
        db.scalars(
            select(ScheduledTask).where(ScheduledTask.user_id == user_id).order_by(ScheduledTask.created_at.desc())
        )
    )


def get_by_id_for_user(db: Session, task_id: uuid.UUID, user_id: uuid.UUID) -> ScheduledTask | None:
    return db.scalar(select(ScheduledTask).where(ScheduledTask.id == task_id, ScheduledTask.user_id == user_id))


def get_by_id(db: Session, task_id: uuid.UUID) -> ScheduledTask | None:
    """Used only by the scheduler loop, which isn't acting on behalf of any
    one authenticated request - everywhere else goes through
    get_by_id_for_user so a task can never be read/modified cross-user."""
    return db.get(ScheduledTask, task_id)


def list_due(db: Session, now: datetime) -> list[ScheduledTask]:
    """Across ALL users - the background scheduler loop isn't scoped to a
    single request/user the way everything else in this file is."""
    return list(db.scalars(select(ScheduledTask).where(ScheduledTask.enabled.is_(True), ScheduledTask.next_run_at <= now)))


def create(
    db: Session,
    user_id: uuid.UUID,
    prompt: str,
    schedule_type: ScheduleType,
    run_at_time: time | None,
    interval_hours: int | None,
    next_run_at: datetime,
) -> ScheduledTask:
    task = ScheduledTask(
        user_id=user_id,
        prompt=prompt,
        schedule_type=schedule_type,
        run_at_time=run_at_time,
        interval_hours=interval_hours,
        next_run_at=next_run_at,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def set_enabled(db: Session, task: ScheduledTask, enabled: bool) -> ScheduledTask:
    task.enabled = enabled
    db.commit()
    db.refresh(task)
    return task


def record_run(db: Session, task: ScheduledTask, ran_at: datetime, next_run_at: datetime) -> ScheduledTask:
    task.last_run_at = ran_at
    task.next_run_at = next_run_at
    db.commit()
    db.refresh(task)
    return task


def delete(db: Session, task: ScheduledTask) -> None:
    db.delete(task)
    db.commit()
