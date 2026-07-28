import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.knowledge_source import KnowledgeSource
from app.models.user import User
from app.schemas.knowledge import AddNoteRequest, AddUrlRequest, SourceResponse
from app.services import knowledge_service

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

_MAX_FILE_BYTES = 10 * 1024 * 1024


def _to_response(source: KnowledgeSource) -> SourceResponse:
    return SourceResponse(
        id=source.id,
        title=source.title,
        source_type=source.source_type,
        original_reference=source.original_reference,
        status=source.status,
        error_message=source.error_message,
        chunk_count=len(source.chunks),
        created_at=source.created_at,
    )


@router.get("/sources", response_model=list[SourceResponse])
def list_sources(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[SourceResponse]:
    return [_to_response(s) for s in knowledge_service.list_sources(db, current_user.id)]


@router.post("/sources/file", response_model=SourceResponse)
async def add_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SourceResponse:
    content = await file.read()
    if len(content) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is too large (max 10MB).")
    source = knowledge_service.add_file(db, current_user.id, file.filename or "document", content)
    return _to_response(source)


@router.post("/sources/url", response_model=SourceResponse)
def add_url(
    payload: AddUrlRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SourceResponse:
    source = knowledge_service.add_url(db, current_user.id, payload.url)
    return _to_response(source)


@router.post("/sources/note", response_model=SourceResponse)
def add_note(
    payload: AddNoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SourceResponse:
    source = knowledge_service.add_note(db, current_user.id, payload.title, payload.content)
    return _to_response(source)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(
    source_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    knowledge_service.delete_source(db, current_user.id, source_id)
