import json

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.prompts import MEMORY_EXTRACTION_PROMPT
from app.core.logging import get_logger
from app.models.memory_entry import MemoryCategory

logger = get_logger(__name__)


def extract_facts(chat_model: BaseChatModel, user_message: str, assistant_reply: str) -> list[tuple[str, MemoryCategory]]:
    """Best-effort: any failure (bad JSON, model error) just yields no facts -
    this must never be allowed to break the actual chat reply it runs after."""
    prompt = f"User said: {user_message}\nAssistant replied: {assistant_reply}"
    try:
        response = chat_model.invoke([SystemMessage(content=MEMORY_EXTRACTION_PROMPT), HumanMessage(content=prompt)])
        text = str(response.content).strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:]
        items = json.loads(text)
    except Exception:  # noqa: BLE001 - best-effort, must never break the chat reply it runs after
        logger.exception("Memory fact extraction failed - yielding no facts for this turn")
        return []

    if not isinstance(items, list):
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
