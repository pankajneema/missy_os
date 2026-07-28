import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.ai.chunking import split_text
from app.ai.documents import extract_text
from app.ai.embeddings import embed_text, embed_texts
from app.ai.web import fetch_page
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_source import KnowledgeSource, SourceType
from app.repositories import knowledge_repo


def _ingest(db: Session, source: KnowledgeSource, raw_text: str) -> None:
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


def add_file(db: Session, user_id: uuid.UUID, filename: str, content: bytes) -> KnowledgeSource:
    source = knowledge_repo.create_source(
        db, user_id=user_id, title=filename, source_type=SourceType.file, original_reference=filename
    )
    try:
        text = extract_text(filename, content)
    except HTTPException as exc:
        knowledge_repo.mark_failed(db, source, exc.detail)
        return source
    _ingest(db, source, text)
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
    _ingest(db, source, text)
    return source


def add_note(db: Session, user_id: uuid.UUID, title: str, content: str) -> KnowledgeSource:
    source = knowledge_repo.create_source(
        db, user_id=user_id, title=title, source_type=SourceType.text, original_reference=None
    )
    _ingest(db, source, content)
    return source


def list_sources(db: Session, user_id: uuid.UUID) -> list[KnowledgeSource]:
    return knowledge_repo.list_sources(db, user_id)


def delete_source(db: Session, user_id: uuid.UUID, source_id: uuid.UUID) -> None:
    source = knowledge_repo.get_source_for_user(db, source_id, user_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge source not found")
    knowledge_repo.delete_source(db, source)


def search(db: Session, user_id: uuid.UUID, query: str, top_k: int = 5) -> list[KnowledgeChunk]:
    query_embedding = embed_text(query)
    return knowledge_repo.search_chunks(db, user_id, query_embedding, top_k)


def has_ready_sources(db: Session, user_id: uuid.UUID) -> bool:
    return knowledge_repo.has_ready_sources(db, user_id)
