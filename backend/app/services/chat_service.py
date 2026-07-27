import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.ai.chains import build_chat_chain
from app.ai.model_factory import build_chat_model
from app.ai.prompts import build_system_prompt
from app.core.encryption import decrypt_secret
from app.models.conversation import Conversation
from app.models.llm_credential import LLMProvider
from app.models.message import Message, MessageRole
from app.repositories import conversation_repo, credential_repo, message_repo, profile_repo


def list_conversations(db: Session, user_id: uuid.UUID) -> list[Conversation]:
    return conversation_repo.list_by_user(db, user_id)


def create_conversation(db: Session, user_id: uuid.UUID) -> Conversation:
    return conversation_repo.create(db, user_id)


def get_conversation_messages(db: Session, user_id: uuid.UUID, conversation_id: uuid.UUID) -> list[Message]:
    conversation = conversation_repo.get_by_id_for_user(db, conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return message_repo.list_by_conversation(db, conversation_id)


def send_message(
    db: Session, user_id: uuid.UUID, conversation_id: uuid.UUID, content: str, provider: LLMProvider
) -> Message:
    conversation = conversation_repo.get_by_id_for_user(db, conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    profile = profile_repo.get_by_user_id(db, user_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete onboarding before chatting - Missy needs to know who she's assisting.",
        )

    credential = credential_repo.get_by_user_and_provider(db, user_id, provider)
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{provider.value} isn't configured - add it in Settings first.",
        )

    api_key = decrypt_secret(credential.encrypted_api_key)
    chat_model = build_chat_model(credential.provider, credential.model_name, api_key)
    chain = build_chat_chain(chat_model, db)

    try:
        reply_text = chain.invoke(
            {"input": content, "system_prompt": build_system_prompt(profile)},
            config={"configurable": {"session_id": str(conversation_id)}},
        )
    except Exception as exc:  # noqa: BLE001 - surface provider/auth errors as a clean 502, not a 500 traceback
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The LLM provider rejected the request: {exc}",
        ) from exc

    # RunnableWithMessageHistory already persisted both the human and AI
    # turns via PostgresChatMessageHistory.add_message - fetch the row we
    # just wrote so we can return a proper MessageResponse to the caller.
    messages = message_repo.list_by_conversation(db, conversation_id)
    last_assistant_message = next(m for m in reversed(messages) if m.role == MessageRole.assistant)

    credential_repo.set_last_used(db, user_id, provider)
    return last_assistant_message
