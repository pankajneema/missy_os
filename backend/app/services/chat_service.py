import base64
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import HTTPException, status
from fastapi.concurrency import run_in_threadpool
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command
from sqlalchemy.orm import Session

from app.ai.chains import PostgresChatMessageHistory
from app.ai.documents import extract_text, truncate_for_single_turn
from app.ai.graph import USER_FACING_NODES, build_graph
from app.ai.model_factory import build_chat_model
from app.ai.prompts import build_document_context, build_human_content, build_memory_context, build_system_prompt
from app.ai.tools import build_tools
from app.core.encryption import decrypt_secret
from app.core.logging import get_logger
from app.models.conversation import Conversation
from app.models.llm_credential import LLMCredential, LLMProvider
from app.models.message import Message, MessageRole
from app.models.pending_confirmation import PendingToolConfirmation
from app.repositories import conversation_repo, credential_repo, message_repo, pending_confirmation_repo, profile_repo
from app.services import mcp_service, memory_service

logger = get_logger(__name__)

# Each turn gets a fresh, never-reused thread - a checkpointed LangGraph
# thread only ever needs to survive long enough to resume one paused turn
# (see app/ai/graph.py's risky-tool interrupt), not the whole conversation.
_RECURSION_LIMIT = 30


def list_conversations(db: Session, user_id: uuid.UUID) -> list[Conversation]:
    return conversation_repo.list_by_user(db, user_id)


def create_conversation(db: Session, user_id: uuid.UUID) -> Conversation:
    return conversation_repo.create(db, user_id)


def get_conversation_messages(db: Session, user_id: uuid.UUID, conversation_id: uuid.UUID) -> list[Message]:
    conversation = conversation_repo.get_by_id_for_user(db, conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return message_repo.list_by_conversation(db, conversation_id)


def get_pending_confirmation(db: Session, user_id: uuid.UUID, conversation_id: uuid.UUID) -> PendingToolConfirmation | None:
    """Lets the frontend recover a still-paused turn after a page reload -
    the confirmation card only shows from client-side state otherwise, which
    doesn't survive a refresh even though the paused turn itself does."""
    conversation = conversation_repo.get_by_id_for_user(db, conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return pending_confirmation_repo.get_latest_for_conversation(db, conversation_id)


def _get_usable_credential(db: Session, user_id: uuid.UUID, provider: LLMProvider) -> LLMCredential:
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
    return credential


async def _build_graph_for_user(db: Session, user_id: uuid.UUID, credential: LLMCredential, checkpointer: AsyncPostgresSaver):
    api_key = decrypt_secret(credential.encrypted_api_key)
    chat_model = build_chat_model(credential.provider, credential.model_name, api_key)
    tools = build_tools(db, user_id)
    native_tool_names = {t.name for t in tools}
    tools.extend(await mcp_service.get_mcp_tools(db, user_id))
    graph = build_graph(checkpointer, chat_model, tools, user_id, native_tool_names)
    return graph, chat_model


def _message_json(message: Message) -> dict[str, Any]:
    return {
        "id": str(message.id),
        "role": message.role.value,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
    }


def _confirmation_json(confirmation: PendingToolConfirmation) -> dict[str, Any]:
    return {
        "id": str(confirmation.id),
        "tool_name": confirmation.tool_name,
        "tool_args": confirmation.tool_args,
        "created_at": confirmation.created_at.isoformat(),
    }


async def _finish_turn(
    db: Session,
    conversation_id: uuid.UUID,
    user_message: Message,
    final_messages: list,
    user_id: uuid.UUID,
    chat_model,
    provider: LLMProvider,
) -> Message:
    """A turn that ran to completion (no pending confirmation): patch the
    already-persisted user message with a tool-usage marker if any tools
    ran, persist the assistant's reply, and do the best-effort post-turn work."""
    used_tool_names = [m.name for m in final_messages if isinstance(m, ToolMessage)]
    if used_tool_names and "📎" not in user_message.content:
        unique_tools = ", ".join(dict.fromkeys(used_tool_names))
        message_repo.update_content(db, user_message, f"{user_message.content}\n\n🔧 [Used: {unique_tools}]")

    final_content = final_messages[-1].content
    assistant_message = message_repo.create(
        db, conversation_id=conversation_id, role=MessageRole.assistant, content=final_content
    )

    # Best-effort - reuses the same model/credential already paid for this
    # turn, and can never fail the chat response since it runs after it.
    # run_in_threadpool: this makes a blocking LLM call plus an embedding
    # model call - run inline it would stall the event loop (and therefore
    # every other in-flight request) for the duration.
    await run_in_threadpool(memory_service.extract_and_remember, db, user_id, chat_model, user_message.content, final_content)
    credential_repo.set_last_used(db, user_id, provider)
    return assistant_message


async def _stream_graph_run(
    db: Session,
    conversation_id: uuid.UUID,
    user_message: Message,
    graph,
    chat_model,
    thread_id: str,
    provider: LLMProvider,
    user_id: uuid.UUID,
    graph_input,
) -> AsyncIterator[dict[str, Any]]:
    """Shared streaming core for both a fresh turn and a resumed one (after a
    tool confirmation). Emits status/token events as the graph runs, then
    persists once it either finishes or pauses for another confirmation.
    No HTTPExceptions from here on - the response has already started
    streaming with a 200 by the time this runs, so failures are just another
    event type instead of an HTTP status code."""
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": _RECURSION_LIMIT}
    revise_status_sent = False
    try:
        async for event in graph.astream_events(graph_input, config=config, version="v2"):
            if event["event"] == "on_tool_start":
                yield {"type": "status", "tool": event.get("name")}
            elif event["event"] == "on_chat_model_stream":
                # Only agent/finalize/revise produce the actual reply -
                # supervisor's routing call, researcher's investigation
                # steps, and critique's verdict also stream tokens, but
                # showing those to the user would leak "RESEARCH" and
                # internal review chatter into the chat instead of the one
                # clean answer they're meant to see.
                node = event.get("metadata", {}).get("langgraph_node")
                if node not in USER_FACING_NODES:
                    continue
                if node == "revise" and not revise_status_sent:
                    # Signals the transition so a corrected answer doesn't
                    # look like it's silently overwriting the draft that
                    # already streamed - see app/ai/graph.py's critique step.
                    yield {"type": "status", "tool": "self-review"}
                    revise_status_sent = True
                chunk = event["data"]["chunk"]
                if chunk.content:
                    yield {"type": "token", "text": chunk.content}
    except Exception as exc:  # noqa: BLE001 - surface provider/auth errors as a stream event, not a crash
        logger.exception("Streaming graph run failed for user %s", user_id)
        yield {"type": "error", "detail": f"The LLM provider rejected the request: {exc}"}
        return

    state = await graph.aget_state(config)
    if state.tasks and state.tasks[0].interrupts:
        payload = state.tasks[0].interrupts[0].value
        confirmation = pending_confirmation_repo.create(
            db,
            conversation_id=conversation_id,
            user_message_id=user_message.id,
            thread_id=thread_id,
            provider=provider,
            tool_name=payload["tool_name"],
            tool_args=payload["tool_args"],
        )
        yield {"type": "needs_confirmation", "confirmation": _confirmation_json(confirmation)}
        return

    final_messages = state.values["messages"]
    assistant_message = await _finish_turn(db, conversation_id, user_message, final_messages, user_id, chat_model, provider)
    yield {"type": "done", "message": _message_json(assistant_message)}


async def prepare_send(
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    content: str,
    provider: LLMProvider,
    checkpointer: AsyncPostgresSaver,
    image_bytes: bytes | None = None,
    image_content_type: str | None = None,
    document_filename: str | None = None,
    document_bytes: bytes | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Validates the request and persists the user's turn - anything that
    should fail with a clean 4xx happens here, synchronously, before any
    streaming response has started. Returns the generator that actually
    streams the model's turn."""
    conversation = conversation_repo.get_by_id_for_user(db, conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    profile = profile_repo.get_by_user_id(db, user_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete onboarding before chatting - Missy needs to know who she's assisting.",
        )

    credential = _get_usable_credential(db, user_id, provider)

    # What the MODEL sees this turn: text + inline image + full document text + memory.
    # Knowledge base lookup is no longer forced in here - it's a tool the
    # model calls itself when it decides a question needs it (see app/ai/tools.py).
    model_facing_text = content
    if document_filename and document_bytes:
        # run_in_threadpool: a scanned PDF falls back to OCR (see
        # app/ai/documents.py), which is genuinely slow and CPU-bound - run
        # inline it would stall every other in-flight request meanwhile.
        document_text = truncate_for_single_turn(
            await run_in_threadpool(extract_text, document_filename, document_bytes)
        )
        model_facing_text = f"{content}\n\n{build_document_context(document_filename, document_text)}"

    # Memory retrieval is always on (unlike the knowledge base tool, which the
    # model calls at its own discretion) - this is what makes Missy feel like
    # she knows the user, not something that needs to be invoked per message.
    try:
        # run_in_threadpool - embed_text loads/runs a sentence-transformers
        # model, a blocking CPU call that would otherwise stall the event loop.
        relevant_memories = await run_in_threadpool(memory_service.search, db, user_id, content)
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

    # Persisted immediately, before the model even runs: what gets stored is
    # the original text plus an attachment marker if relevant (never the full
    # model-facing text). A tool-usage marker gets appended after the turn
    # completes, once we actually know whether any tools ran.
    stored_content = content
    if image_data_url:
        stored_content = f"{content}\n\n📎 [Image attached - not retained in later turns]"
    elif document_filename:
        stored_content = f"{content}\n\n📎 [Document '{document_filename}' attached - not retained in later turns]"
    user_message = message_repo.create(db, conversation_id=conversation_id, role=MessageRole.user, content=stored_content)

    graph, chat_model = await _build_graph_for_user(db, user_id, credential, checkpointer)
    thread_id = str(uuid.uuid4())

    return _stream_graph_run(
        db, conversation_id, user_message, graph, chat_model, thread_id, provider, user_id, {"messages": messages}
    )


async def prepare_confirm(
    db: Session,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID,
    confirmation_id: uuid.UUID,
    approved: bool,
    checkpointer: AsyncPostgresSaver,
) -> AsyncIterator[dict[str, Any]]:
    conversation = conversation_repo.get_by_id_for_user(db, conversation_id, user_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    confirmation = pending_confirmation_repo.get_for_conversation(db, confirmation_id, conversation_id)
    if confirmation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Confirmation not found")

    # Re-checked, not assumed - time may have passed since the original turn
    # started, and the credential could have been revoked or deleted since.
    credential = _get_usable_credential(db, user_id, confirmation.provider)
    graph, chat_model = await _build_graph_for_user(db, user_id, credential, checkpointer)

    user_message = confirmation.user_message
    thread_id = confirmation.thread_id
    provider = confirmation.provider
    pending_confirmation_repo.delete(db, confirmation)

    return _stream_graph_run(
        db, conversation_id, user_message, graph, chat_model, thread_id, provider, user_id, Command(resume=approved)
    )
