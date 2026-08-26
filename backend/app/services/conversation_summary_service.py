from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from app.ai.prompts import CONVERSATION_SUMMARY_PROMPT, build_conversation_summary_update_prompt
from app.core.logging import get_logger
from app.models.conversation import Conversation
from app.models.message import Message
from app.repositories import conversation_repo, message_repo

logger = get_logger(__name__)

# Un-summarized message count that triggers a compression pass.
_COMPRESS_THRESHOLD = 40
# Always left raw, most recent - never folded into the summary. Keeps the
# immediate back-and-forth word-for-word even right after compressing.
_KEEP_RECENT = 20


def _uncompressed_messages(db: Session, conversation: Conversation) -> list[Message]:
    rows = message_repo.list_by_conversation(db, conversation.id)
    cutoff_id = conversation.summarized_through_message_id
    if cutoff_id is None:
        return rows
    for i, row in enumerate(rows):
        if row.id == cutoff_id:
            return rows[i + 1 :]
    return rows  # cutoff row no longer found (shouldn't happen) - fail open rather than skip forever


def maybe_compress(db: Session, conversation: Conversation, chat_model: BaseChatModel) -> None:
    """Best-effort housekeeping run after a turn completes (see
    chat_service._finish_turn) - same safety pattern as memory extraction:
    never raises, so a failed or slow summarization pass can never break the
    reply it runs after. Purely additive to what future turns send the
    model; the raw `messages` table is never touched, so the REST API and
    any history view keep showing every message, always."""
    try:
        rows = _uncompressed_messages(db, conversation)
        if len(rows) <= _COMPRESS_THRESHOLD:
            return

        to_fold, kept_raw = rows[: len(rows) - _KEEP_RECENT], rows[len(rows) - _KEEP_RECENT :]
        if not to_fold:
            return

        transcript = "\n".join(f"{row.role.value}: {row.content}" for row in to_fold)
        prompt = build_conversation_summary_update_prompt(conversation.summary, transcript)
        response = chat_model.invoke([SystemMessage(content=CONVERSATION_SUMMARY_PROMPT), HumanMessage(content=prompt)])
        new_summary = str(response.content).strip()
        if not new_summary:
            return

        conversation_repo.update_summary(db, conversation, new_summary, to_fold[-1].id)
        logger.info(
            "Compressed conversation %s: folded %d message(s), kept %d raw", conversation.id, len(to_fold), len(kept_raw)
        )
    except Exception:  # noqa: BLE001 - best-effort, must never break the chat reply it runs after
        logger.exception("Conversation compression failed for conversation %s - continuing without it", conversation.id)
