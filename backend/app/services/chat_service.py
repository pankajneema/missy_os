import base64
import uuid

from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from sqlalchemy.orm import Session

from app.ai.chains import PostgresChatMessageHistory
from app.ai.documents import extract_text, truncate_for_single_turn
from app.ai.model_factory import build_chat_model
from app.ai.prompts import build_document_context, build_human_content, build_memory_context, build_system_prompt
from app.ai.tools import build_tools
from app.core.encryption import decrypt_secret
from app.core.logging import get_logger
from app.models.conversation import Conversation
from app.models.llm_credential import LLMProvider
from app.models.message import Message, MessageRole
from app.repositories import conversation_repo, credential_repo, message_repo, profile_repo
from app.services import mcp_service, memory_service

logger = get_logger(__name__)


async def _invoke_with_tool_fallback(model_with_tools, chat_model, messages: list, user_id: uuid.UUID):
    """Some providers/models (seen in practice: Groq's llama-3.3-70b-versatile
    once ~15+ tools are bound at once) occasionally can't format a valid tool
    call and reject the request outright. Rather than failing the whole chat
    turn, retry once with tools unbound - the model just answers directly,
    which is a fine degraded outcome for a reply that didn't strictly need a
    tool anyway, and better than a hard error for one that did."""
    try:
        return await model_with_tools.ainvoke(messages)
    except Exception:  # noqa: BLE001
        logger.exception("Tool-bound generation failed for user %s - retrying without tools", user_id)
        return await chat_model.ainvoke(messages)


def _stringify_tool_result(result: object) -> str:
    """Native tools return a plain string. MCP tools return a list of
    content blocks (MCP supports text/image/audio in one result) - stringify
    that naively and the model sees Python repr noise like "[{'type':
    'text', 'text': '...', 'id': '...'}]" instead of the actual text."""
    if isinstance(result, list) and all(isinstance(block, dict) and "text" in block for block in result):
        return "\n".join(block["text"] for block in result)
    return str(result)

# Tool-calling is a back-and-forth: model asks for a tool, we run it, model
# sees the result and either answers or asks for another. Capped so a model
# that never stops calling tools can't turn one chat turn into an infinite loop.
_MAX_TOOL_ROUNDS = 5


def list_conversations(db: Session, user_id: uuid.UUID) -> list[Conversation]:
    return conversation_repo.list_by_user(db, user_id)


def create_conversation(db: Session, user_id: uuid.UUID) -> Conversation:
    return conversation_repo.create(db, user_id)


def get_conversation_messages(db: Session, user_id: uuid.UUID, conversation_id: uuid.UUID) -> list[Message]:
    conversation = conversation_repo.get_by_id_for_user(db, conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return message_repo.list_by_conversation(db, conversation_id)


async def send_message(
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    content: str,
    provider: LLMProvider,
    image_bytes: bytes | None = None,
    image_content_type: str | None = None,
    document_filename: str | None = None,
    document_bytes: bytes | None = None,
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
    if credential.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{provider.value} has been revoked in API Connections - unrevoke it or add a new key to use it again.",
        )

    # What the MODEL sees this turn: text + inline image + full document text + memory.
    # Knowledge base lookup is no longer forced in here - it's a tool the
    # model calls itself when it decides a question needs it (see app/ai/tools.py).
    model_facing_text = content
    if document_filename and document_bytes:
        document_text = truncate_for_single_turn(extract_text(document_filename, document_bytes))
        model_facing_text = f"{content}\n\n{build_document_context(document_filename, document_text)}"

    # Memory retrieval is always on (unlike the knowledge base tool, which the
    # model calls at its own discretion) - this is what makes Missy feel like
    # she knows the user, not something that needs to be invoked per message.
    try:
        relevant_memories = memory_service.search(db, user_id, content)
    except Exception:  # noqa: BLE001 - always-on retrieval must never block the chat turn
        logger.exception("Memory retrieval failed for user %s - continuing without memory context", user_id)
        relevant_memories = []
    memory_context = build_memory_context(relevant_memories)
    if memory_context:
        model_facing_text = f"{model_facing_text}\n\n{memory_context}"

    image_data_url = None
    if image_bytes and image_content_type:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        image_data_url = f"data:{image_content_type};base64,{b64}"

    history_messages = PostgresChatMessageHistory(conversation_id, db).messages
    messages = [
        SystemMessage(content=build_system_prompt(profile)),
        *history_messages,
        HumanMessage(content=build_human_content(model_facing_text, image_data_url)),
    ]

    api_key = decrypt_secret(credential.encrypted_api_key)
    chat_model = build_chat_model(credential.provider, credential.model_name, api_key)

    tools = build_tools(db, user_id)
    tools.extend(await mcp_service.get_mcp_tools(db, user_id))
    tools_by_name = {t.name: t for t in tools}
    model_with_tools = chat_model.bind_tools(tools)

    used_tool_names: list[str] = []
    try:
        response = await _invoke_with_tool_fallback(model_with_tools, chat_model, messages, user_id)
        for _ in range(_MAX_TOOL_ROUNDS):
            if not response.tool_calls:
                break
            messages.append(response)
            for call in response.tool_calls:
                tool_fn = tools_by_name.get(call["name"])
                if tool_fn is None:
                    result = f"Unknown tool: {call['name']}"
                else:
                    try:
                        # ainvoke, not invoke - MCP-backed tools are async-only
                        # (no sync _run), and every LangChain tool supports
                        # ainvoke regardless, so this covers both uniformly.
                        result = _stringify_tool_result(await tool_fn.ainvoke(call["args"]))
                    except Exception:  # noqa: BLE001 - a broken tool must not fail the whole turn
                        logger.exception("Tool '%s' raised during a chat turn for user %s", call["name"], user_id)
                        result = f"The '{call['name']}' tool failed - answer without it, or tell the user."
                used_tool_names.append(call["name"])
                messages.append(ToolMessage(content=result, tool_call_id=call["id"]))
            response = await _invoke_with_tool_fallback(model_with_tools, chat_model, messages, user_id)
    except Exception as exc:  # noqa: BLE001 - surface provider/auth errors as a clean 502, not a 500 traceback
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The LLM provider rejected the request: {exc}",
        ) from exc

    # What gets PERSISTED to history: the original text plus a short marker.
    # Images and full document text are never replayed in later turns - only
    # the current turn ever pays for those tokens.
    stored_content = content
    if image_data_url:
        stored_content = f"{content}\n\n📎 [Image attached - not retained in later turns]"
    elif document_filename:
        stored_content = f"{content}\n\n📎 [Document '{document_filename}' attached - not retained in later turns]"
    elif used_tool_names:
        unique_tools = ", ".join(dict.fromkeys(used_tool_names))
        stored_content = f"{content}\n\n🔧 [Used: {unique_tools}]"

    message_repo.create(db, conversation_id=conversation_id, role=MessageRole.user, content=stored_content)
    assistant_message = message_repo.create(
        db, conversation_id=conversation_id, role=MessageRole.assistant, content=response.content
    )

    # Best-effort - reuses the same model/credential already paid for this
    # turn, and can never fail the chat response since it runs after it.
    memory_service.extract_and_remember(db, user_id, chat_model, content, response.content)

    credential_repo.set_last_used(db, user_id, provider)
    return assistant_message
