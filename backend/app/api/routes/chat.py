import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.llm_credential import LLMProvider
from app.models.user import User
from app.schemas.chat import ConversationResponse, MessageResponse
from app.services import chat_service

router = APIRouter(prefix="/conversations", tags=["chat"])

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB - generous for a single image/doc, not a file store


@router.get("", response_model=list[ConversationResponse])
def list_conversations(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ConversationResponse]:
    return [ConversationResponse.model_validate(c) for c in chat_service.list_conversations(db, current_user.id)]


@router.post("", response_model=ConversationResponse)
def create_conversation(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> ConversationResponse:
    return ConversationResponse.model_validate(chat_service.create_conversation(db, current_user.id))


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
def get_messages(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MessageResponse]:
    messages = chat_service.get_conversation_messages(db, current_user.id, conversation_id)
    return [MessageResponse.model_validate(m) for m in messages]


@router.post("/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
    conversation_id: uuid.UUID,
    content: str = Form(...),
    provider: LLMProvider = Form(...),
    image: UploadFile | None = File(default=None),
    document: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    image_bytes = None
    image_content_type = None
    if image is not None:
        image_bytes = await image.read()
        if len(image_bytes) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image is too large (max 10MB).")
        image_content_type = image.content_type or "image/png"

    document_bytes = None
    document_filename = None
    if document is not None:
        document_bytes = await document.read()
        if len(document_bytes) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document is too large (max 10MB).")
        document_filename = document.filename or "document"

    reply = await chat_service.send_message(
        db,
        current_user.id,
        conversation_id,
        content,
        provider,
        image_bytes=image_bytes,
        image_content_type=image_content_type,
        document_filename=document_filename,
        document_bytes=document_bytes,
    )
    return MessageResponse.model_validate(reply)
