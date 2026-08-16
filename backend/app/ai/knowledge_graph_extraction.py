import json

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.prompts import KNOWLEDGE_GRAPH_EXTRACTION_PROMPT
from app.core.logging import get_logger

logger = get_logger(__name__)

# Only the first slice of a document is sent for extraction, not the whole
# thing - long documents (the Cloudshope doc alone ran ~18 chunks) would
# otherwise turn ingestion into a large, slow, expensive LLM call. A partial
# graph from the start of a long document is an accepted v1 limitation, not
# a bug: extraction is best-effort and additive, not the primary retrieval
# path (chunk search still covers the whole document either way).
_MAX_EXTRACTION_CHARS = 6000


def extract_graph_data(chat_model: BaseChatModel, text: str) -> list[dict]:
    """Best-effort: any failure (bad JSON, model error) just yields nothing -
    this must never break document ingestion, which already succeeded via
    the chunk+embed pipeline before this ever runs."""
    try:
        response = chat_model.invoke(
            [
                SystemMessage(content=KNOWLEDGE_GRAPH_EXTRACTION_PROMPT),
                HumanMessage(content=text[:_MAX_EXTRACTION_CHARS]),
            ]
        )
        raw = str(response.content).strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
        items = json.loads(raw)
    except Exception:  # noqa: BLE001 - best-effort, must never break ingestion
        logger.exception("Knowledge graph extraction failed - continuing without it")
        return []

    if not isinstance(items, list):
        return []

    valid = []
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        if not item.get("source") or not item.get("relationship") or not item.get("target"):
            continue
        valid.append(item)
    return valid
