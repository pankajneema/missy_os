import uuid

from fastapi import HTTPException, status
from langchain_core.language_models import BaseChatModel
from sqlalchemy.orm import Session

from app.ai.embeddings import embed_text
from app.ai.memory_extraction import extract_facts
from app.core.logging import get_logger
from app.models.memory_entry import MemoryCategory, MemoryEntry, MemorySource
from app.repositories import memory_repo

logger = get_logger(__name__)

# Cosine distance below this = "close enough to be the same fact" - a new
# statement gets treated as an update to the existing memory rather than a
# duplicate. 1.0 - 0.15 = 0.85 similarity threshold.
_SUPERSEDE_DISTANCE_THRESHOLD = 0.15


def remember(
    db: Session, user_id: uuid.UUID, content: str, source: MemorySource, category: MemoryCategory = MemoryCategory.fact
) -> MemoryEntry:
    embedding = embed_text(content)
    closest = memory_repo.find_closest(db, user_id, embedding)

    if closest is not None:
        entry, distance = closest
        if distance < _SUPERSEDE_DISTANCE_THRESHOLD:
            return memory_repo.update_content(db, entry, content, embedding)

    return memory_repo.create(db, user_id, content, embedding, source, category)


def extract_and_remember(db: Session, user_id: uuid.UUID, chat_model: BaseChatModel, user_message: str, assistant_reply: str) -> None:
    """Best-effort background step - never raises, so it can never break the
    chat turn it runs after."""
    try:
        facts = extract_facts(chat_model, user_message, assistant_reply)
        for content, category in facts:
            remember(db, user_id, content, MemorySource.auto, category)
    except Exception:  # noqa: BLE001 - best-effort, must never break the chat reply it runs after
        logger.exception("Auto memory extraction/save failed for user %s", user_id)


def search(db: Session, user_id: uuid.UUID, query: str, top_k: int = 5) -> list[MemoryEntry]:
    query_embedding = embed_text(query)
    return memory_repo.search(db, user_id, query_embedding, top_k)


def list_memories(db: Session, user_id: uuid.UUID) -> list[MemoryEntry]:
    return memory_repo.list_for_user(db, user_id)


def delete_memory(db: Session, user_id: uuid.UUID, entry_id: uuid.UUID) -> None:
    entry = memory_repo.get_for_user(db, entry_id, user_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")
    memory_repo.delete(db, entry)
