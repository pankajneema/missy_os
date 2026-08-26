import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.scheduled_task import ScheduledTaskCreateRequest, ScheduledTaskEnabledRequest, ScheduledTaskResponse
from app.services import scheduled_task_service

router = APIRouter(prefix="/scheduled-tasks", tags=["scheduled-tasks"])


@router.get("", response_model=list[ScheduledTaskResponse])
def list_tasks(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ScheduledTaskResponse]:
    return [ScheduledTaskResponse.model_validate(t) for t in scheduled_task_service.list_tasks(db, current_user.id)]


@router.post("", response_model=ScheduledTaskResponse)
def create_task(
    payload: ScheduledTaskCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScheduledTaskResponse:
    task = scheduled_task_service.create_task(
        db, current_user.id, payload.prompt, payload.schedule_type, payload.run_at_time, payload.interval_hours
    )
    return ScheduledTaskResponse.model_validate(task)


@router.post("/{task_id}/enabled", response_model=ScheduledTaskResponse)
def set_enabled(
    task_id: uuid.UUID,
    payload: ScheduledTaskEnabledRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScheduledTaskResponse:
    task = scheduled_task_service.set_enabled(db, current_user.id, task_id, payload.enabled)
    return ScheduledTaskResponse.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    scheduled_task_service.delete_task(db, current_user.id, task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
