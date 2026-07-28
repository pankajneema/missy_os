import base64
import uuid

from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from app.ai.chains import PostgresChatMessageHistory
from app.ai.documents import extract_text, truncate_for_single_turn
from app.ai.model_factory import build_chat_model
from app.ai.prompts import build_human_content, build_knowledge_context, build_system_prompt
from app.core.encryption import decrypt_secret
from app.models.conversation import Conversation
from app.models.llm_credential import LLMProvider
from app.models.message import Message, MessageRole
from app.repositories import conversation_repo, credential_repo, message_repo, profile_repo
from app.services import knowledge_service


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
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    content: str,
    provider: LLMProvider,
    image_bytes: bytes | None = None,
    image_content_type: str | None = None,
    document_filename: str | None = None,
    document_bytes: bytes | None = None,
    use_knowledge_base: bool = False,
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

    # What the MODEL sees this turn: text + inline image + full document text + retrieved knowledge.
    model_facing_text = content
    if document_filename and document_bytes:
        document_text = truncate_for_single_turn(extract_text(document_filename, document_bytes))
        model_facing_text = f"{content}\n\n--- Attached document: {document_filename} ---\n{document_text}"

    used_knowledge_chunks = []
    if use_knowledge_base:
        used_knowledge_chunks = knowledge_service.search(db, user_id, content)
        knowledge_context = build_knowledge_context(used_knowledge_chunks)
        if knowledge_context:
            model_facing_text = f"{model_facing_text}\n\n{knowledge_context}"

    image_data_url = None
    if image_bytes and image_content_type:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        image_data_url = f"data:{image_content_type};base64,{b64}"

    # What gets PERSISTED to history: the original text plus a short marker.
    # Images and full document text are never replayed in later turns - only
    # the current turn ever pays for those tokens.
    stored_content = content
    if image_data_url:
        stored_content = f"{content}\n\n📎 [Image attached - not retained in later turns]"
    elif document_filename:
        stored_content = f"{content}\n\n📎 [Document '{document_filename}' attached - not retained in later turns]"
    elif used_knowledge_chunks:
        source_titles = ", ".join(sorted({chunk.source.title for chunk in used_knowledge_chunks}))
        stored_content = f"{content}\n\n🔎 [Searched knowledge base: {source_titles}]"

    history_messages = PostgresChatMessageHistory(conversation_id, db).messages
    full_messages = [
        SystemMessage(content=build_system_prompt(profile)),
        *history_messages,
        HumanMessage(content=build_human_content(model_facing_text, image_data_url)),
    ]

    api_key = decrypt_secret(credential.encrypted_api_key)
    chat_model = build_chat_model(credential.provider, credential.model_name, api_key)

    try:
        response = chat_model.invoke(full_messages)
    except Exception as exc:  # noqa: BLE001 - surface provider/auth errors as a clean 502, not a 500 traceback
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The LLM provider rejected the request: {exc}",
        ) from exc

    message_repo.create(db, conversation_id=conversation_id, role=MessageRole.user, content=stored_content)
    assistant_message = message_repo.create(
        db, conversation_id=conversation_id, role=MessageRole.assistant, content=response.content
    )

    credential_repo.set_last_used(db, user_id, provider)
    return assistant_message
