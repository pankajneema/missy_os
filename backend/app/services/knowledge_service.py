import uuid

from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from app.ai.chunking import split_text
from app.ai.documents import extract_text, image_data_url, is_image_file
from app.ai.embeddings import embed_text, embed_texts
from app.ai.fusion import reciprocal_rank_fusion
from app.ai.knowledge_graph_extraction import extract_graph_data
from app.ai.model_factory import build_chat_model
from app.ai.prompts import IMAGE_DESCRIPTION_PROMPT
from app.ai.reranking import rerank
from app.ai.web import fetch_page
from app.core.encryption import decrypt_secret
from app.core.logging import get_logger
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_source import KnowledgeSource, SourceType
from app.repositories import credential_repo, knowledge_graph_repo, knowledge_repo

logger = get_logger(__name__)


def _describe_image(db: Session, user_id: uuid.UUID, filename: str, content: bytes) -> str:
    """Turns image bytes into a searchable text description via a
    vision-capable LLM - this description, not the raw pixels, is what
    actually gets chunked/embedded, since the rest of the KB pipeline is
    text-only. Raises if there's no usable credential or the call fails;
    callers should catch and mark the source failed rather than let a bad
    image silently produce an empty/garbage knowledge source."""
    credential = credential_repo.get_any_usable_credential(db, user_id)
    if credential is None:
        raise ValueError("No API connection is set up yet - add one in API Connections before uploading images.")

    api_key = decrypt_secret(credential.encrypted_api_key)
    chat_model = build_chat_model(credential.provider, credential.model_name, api_key)
    data_url = image_data_url(filename, content)
    message = HumanMessage(
        content=[
            {"type": "text", "text": IMAGE_DESCRIPTION_PROMPT},
            {"type": "image_url", "image_url": {"url": data_url}},
        ]
    )
    try:
        response = chat_model.invoke([message])
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as a failed source
        raise ValueError(f"Image description failed - the connected model may not support images: {exc}") from exc
    return response.content.strip()


def _try_extract_graph(db: Session, user_id: uuid.UUID, source: KnowledgeSource, raw_text: str) -> None:
    """Best-effort, additive - chunk search already covers the document
    regardless of whether this succeeds. Silently does nothing if the user
    has no usable LLM connection yet, rather than failing ingestion over it."""
    credential = credential_repo.get_any_usable_credential(db, user_id)
    if credential is None:
        return
    try:
        api_key = decrypt_secret(credential.encrypted_api_key)
        chat_model = build_chat_model(credential.provider, credential.model_name, api_key)
        items = extract_graph_data(chat_model, raw_text)
        for item in items:
            source_entity = knowledge_graph_repo.get_or_create_entity(
                db, user_id, item["source"], item.get("source_type", "concept"), None
            )
            target_entity = knowledge_graph_repo.get_or_create_entity(
                db, user_id, item["target"], item.get("target_type", "concept"), None
            )
            knowledge_graph_repo.create_relationship(
                db,
                user_id,
                source_entity.id,
                target_entity.id,
                item["relationship"],
                item.get("description"),
                source.id,
            )
    except Exception:  # noqa: BLE001 - best-effort, must never break ingestion
        logger.exception("Knowledge graph extraction failed for source %s - continuing without it", source.id)


def _ingest(db: Session, user_id: uuid.UUID, source: KnowledgeSource, raw_text: str) -> None:
    chunks = split_text(raw_text)
    if not chunks:
        knowledge_repo.mark_failed(db, source, "No usable text was found in this source.")
        return

    try:
        vectors = embed_texts(chunks)
    except Exception as exc:  # noqa: BLE001
        knowledge_repo.mark_failed(db, source, f"Embedding failed: {exc}")
        return

    knowledge_repo.add_chunks(db, source.id, chunks, vectors)
    knowledge_repo.mark_ready(db, source)
    _try_extract_graph(db, user_id, source, raw_text)


def add_file(db: Session, user_id: uuid.UUID, filename: str, content: bytes) -> KnowledgeSource:
    source = knowledge_repo.create_source(
        db, user_id=user_id, title=filename, source_type=SourceType.file, original_reference=filename
    )
    if is_image_file(filename):
        try:
            text = _describe_image(db, user_id, filename, content)
        except ValueError as exc:
            knowledge_repo.mark_failed(db, source, str(exc))
            return source
    else:
        try:
            text = extract_text(filename, content)
        except HTTPException as exc:
            knowledge_repo.mark_failed(db, source, exc.detail)
            return source
    _ingest(db, user_id, source, text)
    return source


def add_url(db: Session, user_id: uuid.UUID, url: str) -> KnowledgeSource:
    source = knowledge_repo.create_source(
        db, user_id=user_id, title=url, source_type=SourceType.url, original_reference=url
    )
    try:
        title, text = fetch_page(url)
    except HTTPException as exc:
        knowledge_repo.mark_failed(db, source, exc.detail)
        return source
    source.title = title or url
    db.commit()
    _ingest(db, user_id, source, text)
    return source


def add_note(db: Session, user_id: uuid.UUID, title: str, content: str) -> KnowledgeSource:
    source = knowledge_repo.create_source(
        db, user_id=user_id, title=title, source_type=SourceType.text, original_reference=None
    )
    _ingest(db, user_id, source, content)
    return source


def list_sources(db: Session, user_id: uuid.UUID) -> list[KnowledgeSource]:
    return knowledge_repo.list_sources(db, user_id)


def delete_source(db: Session, user_id: uuid.UUID, source_id: uuid.UUID) -> None:
    source = knowledge_repo.get_source_for_user(db, source_id, user_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge source not found")
    knowledge_repo.delete_source(db, source)


_CANDIDATE_POOL_SIZE = 20  # how many each retrieval method contributes before fusion + reranking narrow it down


def search(db: Session, user_id: uuid.UUID, query: str, top_k: int = 5) -> list[KnowledgeChunk]:
    """Hybrid search: vector similarity + keyword full-text search, merged via
    Reciprocal Rank Fusion, then precision-reranked with a cross-encoder.
    Pure vector search alone can miss exact terms (names, codenames, jargon)
    that don't embed distinctively - keyword search catches those; RRF makes
    sure a chunk strong in both signals wins over one strong in only one."""
    query_embedding = embed_text(query)
    vector_results = knowledge_repo.search_chunks(db, user_id, query_embedding, _CANDIDATE_POOL_SIZE)
    keyword_results = knowledge_repo.keyword_search_chunks(db, user_id, query, _CANDIDATE_POOL_SIZE)

    fused = reciprocal_rank_fusion(vector_results, keyword_results)
    return rerank(query, fused[:_CANDIDATE_POOL_SIZE], top_k)


def has_ready_sources(db: Session, user_id: uuid.UUID) -> bool:
    return knowledge_repo.has_ready_sources(db, user_id)
