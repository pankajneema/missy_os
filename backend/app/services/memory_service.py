import uuid
from dataclasses import dataclass

from fastapi import HTTPException, status
from langchain_core.language_models import BaseChatModel
from sqlalchemy.orm import Session

from app.ai.embeddings import embed_text
from app.ai.memory_extraction import extract_consolidation_actions, extract_facts
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


@dataclass
class ConsolidationAction:
    remove_entries: list[MemoryEntry]
    replacement: tuple[str, MemoryCategory] | None


def plan_consolidation(db: Session, user_id: uuid.UUID, chat_model: BaseChatModel) -> list[ConsolidationAction]:
    """Read-only: proposes a cleanup plan without touching the database - the
    caller (scripts/consolidate_memories.py) shows this to the user and only
    calls apply_consolidation if they explicitly confirm it. Entries the
    model doesn't mention are left out of the plan entirely, so a partial or
    oddly-shaped response only ever means fewer changes, never a mass delete."""
    entries = memory_repo.list_for_user(db, user_id)
    if len(entries) < 2:
        return []

    id_map = {i + 1: entry for i, entry in enumerate(entries)}
    facts_payload = [{"id": i + 1, "content": e.content, "category": e.category.value} for i, e in enumerate(entries)]
    raw_actions = extract_consolidation_actions(chat_model, facts_payload)

    plan: list[ConsolidationAction] = []
    seen_ids: set[int] = set()
    for raw in raw_actions:
        if not isinstance(raw, dict):
            continue
        remove_ids = raw.get("remove_ids")
        if not isinstance(remove_ids, list) or not remove_ids:
            continue
        # Defend against a malformed or adversarial response: an unknown id,
        # a non-integer, or an id already claimed by an earlier action in
        # this same response must never turn into a KeyError or a
        # double-delete - just drop the whole action instead.
        if any(not isinstance(i, int) or i not in id_map or i in seen_ids for i in remove_ids):
            continue

        replacement_raw = raw.get("replacement")
        replacement = None
        if isinstance(replacement_raw, dict):
            content = str(replacement_raw.get("content", "")).strip()
            if content:
                try:
                    category = MemoryCategory(replacement_raw.get("category", "fact"))
                except ValueError:
                    category = MemoryCategory.fact
                replacement = (content, category)

        entries_to_remove = [id_map[i] for i in remove_ids]
        # No-op guard: "replacing" a single entry with its own unchanged
        # text isn't a real cleanup action - skip it rather than force a write.
        if len(entries_to_remove) == 1 and replacement is not None and replacement[0] == entries_to_remove[0].content:
            continue

        seen_ids.update(remove_ids)
        plan.append(ConsolidationAction(remove_entries=entries_to_remove, replacement=replacement))

    return plan


def apply_consolidation(db: Session, user_id: uuid.UUID, plan: list[ConsolidationAction]) -> dict:
    """Applies a plan from plan_consolidation exactly as given - never
    re-derives or re-validates it, so what gets shown to the user for
    confirmation is exactly what gets applied."""
    removed = 0
    created = 0
    for action in plan:
        for entry in action.remove_entries:
            memory_repo.delete(db, entry)
            removed += 1
        if action.replacement is not None:
            content, category = action.replacement
            embedding = embed_text(content)
            memory_repo.create(db, user_id, content, embedding, MemorySource.auto, category)
            created += 1
    return {"groups": len(plan), "removed": removed, "created": created}
