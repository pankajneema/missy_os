import json

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.prompts import MEMORY_CONSOLIDATION_PROMPT, MEMORY_EXTRACTION_PROMPT
from app.core.logging import get_logger
from app.models.memory_entry import MemoryCategory

logger = get_logger(__name__)


def _parse_json_array(text: str) -> list:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    items = json.loads(text)
    return items if isinstance(items, list) else []


def extract_facts(chat_model: BaseChatModel, user_message: str, assistant_reply: str) -> list[tuple[str, MemoryCategory]]:
    """Best-effort: any failure (bad JSON, model error) just yields no facts -
    this must never be allowed to break the actual chat reply it runs after."""
    prompt = f"User said: {user_message}\nAssistant replied: {assistant_reply}"
    try:
        response = chat_model.invoke([SystemMessage(content=MEMORY_EXTRACTION_PROMPT), HumanMessage(content=prompt)])
        items = _parse_json_array(str(response.content))
    except Exception:  # noqa: BLE001 - best-effort, must never break the chat reply it runs after
        logger.exception("Memory fact extraction failed - yielding no facts for this turn")
        return []

    facts: list[tuple[str, MemoryCategory]] = []
    for item in items[:3]:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        try:
            category = MemoryCategory(item.get("category", "fact"))
        except ValueError:
            category = MemoryCategory.fact
        facts.append((content, category))
    return facts


def extract_consolidation_actions(chat_model: BaseChatModel, facts: list[dict]) -> list[dict]:
    """facts: [{"id": int, "content": str, "category": str}, ...], in the same
    order memory_service.plan_consolidation numbered them. Returns raw action
    dicts straight from the model, unvalidated - resolving local ids back to
    real MemoryEntry rows and defending against a malformed/adversarial
    response (unknown ids, overlapping groups) is plan_consolidation's job,
    not this function's; this one only makes the call and parses JSON."""
    listing = "\n".join(f'{f["id"]}: "{f["content"]}" ({f["category"]})' for f in facts)
    prompt = f"Entries:\n{listing}"
    try:
        response = chat_model.invoke([SystemMessage(content=MEMORY_CONSOLIDATION_PROMPT), HumanMessage(content=prompt)])
        return _parse_json_array(str(response.content))
    except Exception:  # noqa: BLE001 - a failed planning pass yields no actions, never a crash
        logger.exception("Memory consolidation planning failed - yielding no actions")
        return []
