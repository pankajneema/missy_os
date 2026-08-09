import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.memory_entry import MemoryCategory, MemoryEntry, MemorySource


def create(
    db: Session,
    user_id: uuid.UUID,
    content: str,
    embedding: list[float],
    source: MemorySource,
    category: MemoryCategory,
) -> MemoryEntry:
    entry = MemoryEntry(user_id=user_id, content=content, embedding=embedding, source=source, category=category)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_content(db: Session, entry: MemoryEntry, content: str, embedding: list[float]) -> MemoryEntry:
    entry.content = content
    entry.embedding = embedding
    db.commit()
    db.refresh(entry)
    return entry


def find_closest(db: Session, user_id: uuid.UUID, embedding: list[float]) -> tuple[MemoryEntry, float] | None:
    """Returns the single most similar existing memory + its cosine distance,
    so the caller can decide whether it's close enough to be an update to the
    same fact rather than a brand new one."""
    distance = MemoryEntry.embedding.cosine_distance(embedding)
    result = (
        db.execute(select(MemoryEntry, distance.label("distance")).where(MemoryEntry.user_id == user_id).order_by(distance).limit(1))
        .first()
    )
    if result is None:
        return None
    entry, dist = result
    return entry, dist


def search(db: Session, user_id: uuid.UUID, query_embedding: list[float], top_k: int) -> list[MemoryEntry]:
    return list(
        db.scalars(
            select(MemoryEntry)
            .where(MemoryEntry.user_id == user_id)
            .order_by(MemoryEntry.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        )
    )


def list_for_user(db: Session, user_id: uuid.UUID) -> list[MemoryEntry]:
    return list(
        db.scalars(
            select(MemoryEntry).where(MemoryEntry.user_id == user_id).order_by(MemoryEntry.updated_at.desc())
        )
    )


def get_for_user(db: Session, entry_id: uuid.UUID, user_id: uuid.UUID) -> MemoryEntry | None:
    return db.scalar(select(MemoryEntry).where(MemoryEntry.id == entry_id, MemoryEntry.user_id == user_id))


def delete(db: Session, entry: MemoryEntry) -> None:
    db.delete(entry)
    db.commit()
