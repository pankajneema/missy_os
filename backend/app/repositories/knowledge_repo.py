import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_source import KnowledgeSource, SourceStatus, SourceType


def create_source(
    db: Session, user_id: uuid.UUID, title: str, source_type: SourceType, original_reference: str | None
) -> KnowledgeSource:
    source = KnowledgeSource(
        user_id=user_id,
        title=title,
        source_type=source_type,
        original_reference=original_reference,
        status=SourceStatus.processing,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def mark_ready(db: Session, source: KnowledgeSource) -> None:
    source.status = SourceStatus.ready
    db.commit()


def mark_failed(db: Session, source: KnowledgeSource, error_message: str) -> None:
    source.status = SourceStatus.failed
    source.error_message = error_message[:2000]
    db.commit()


def add_chunks(db: Session, source_id: uuid.UUID, texts: list[str], embeddings: list[list[float]]) -> None:
    for index, (text, embedding) in enumerate(zip(texts, embeddings)):
        db.add(KnowledgeChunk(source_id=source_id, chunk_index=index, content=text, embedding=embedding))
    db.commit()


def list_sources(db: Session, user_id: uuid.UUID) -> list[KnowledgeSource]:
    return list(
        db.scalars(
            select(KnowledgeSource)
            .where(KnowledgeSource.user_id == user_id)
            .options(selectinload(KnowledgeSource.chunks))
            .order_by(KnowledgeSource.created_at.desc())
        )
    )


def get_source_for_user(db: Session, source_id: uuid.UUID, user_id: uuid.UUID) -> KnowledgeSource | None:
    return db.scalar(
        select(KnowledgeSource).where(KnowledgeSource.id == source_id, KnowledgeSource.user_id == user_id)
    )


def delete_source(db: Session, source: KnowledgeSource) -> None:
    db.delete(source)
    db.commit()


def has_ready_sources(db: Session, user_id: uuid.UUID) -> bool:
    return (
        db.scalar(
            select(KnowledgeSource.id)
            .where(KnowledgeSource.user_id == user_id, KnowledgeSource.status == SourceStatus.ready)
            .limit(1)
        )
        is not None
    )


def search_chunks(db: Session, user_id: uuid.UUID, query_embedding: list[float], top_k: int) -> list[KnowledgeChunk]:
    return list(
        db.scalars(
            select(KnowledgeChunk)
            .join(KnowledgeSource, KnowledgeChunk.source_id == KnowledgeSource.id)
            .where(KnowledgeSource.user_id == user_id, KnowledgeSource.status == SourceStatus.ready)
            .options(selectinload(KnowledgeChunk.source))
            .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        )
    )
