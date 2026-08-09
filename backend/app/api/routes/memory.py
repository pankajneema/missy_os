import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.memory_entry import MemorySource
from app.models.user import User
from app.schemas.memory import AddMemoryRequest, MemoryResponse
from app.services import memory_service

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("", response_model=list[MemoryResponse])
def list_memories(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MemoryResponse]:
    return [MemoryResponse.model_validate(m) for m in memory_service.list_memories(db, current_user.id)]


@router.post("", response_model=MemoryResponse)
def add_memory(
    payload: AddMemoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryResponse:
    entry = memory_service.remember(db, current_user.id, payload.content, MemorySource.manual, payload.category)
    return MemoryResponse.model_validate(entry)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(
    memory_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    memory_service.delete_memory(db, current_user.id, memory_id)
