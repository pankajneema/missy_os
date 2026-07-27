import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.chat import ConversationResponse, MessageResponse, SendMessageRequest
from app.services import chat_service

router = APIRouter(prefix="/conversations", tags=["chat"])


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
def send_message(
    conversation_id: uuid.UUID,
    payload: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    reply = chat_service.send_message(db, current_user.id, conversation_id, payload.content, payload.provider)
    return MessageResponse.model_validate(reply)
