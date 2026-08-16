import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.knowledge_entity import KnowledgeEntity
from app.models.knowledge_relationship import KnowledgeRelationship


def find_entity_by_name(db: Session, user_id: uuid.UUID, name: str) -> KnowledgeEntity | None:
    """Case-insensitive - "PostgreSQL" and "postgresql" extracted from two
    different documents should resolve to the same node, not split into
    duplicates. Not fuzzy beyond that (e.g. "Postgres" won't match); a
    reasonable v1 given a personal KB's likely scale."""
    return db.scalar(
        select(KnowledgeEntity).where(
            KnowledgeEntity.user_id == user_id, func.lower(KnowledgeEntity.name) == name.lower()
        )
    )


def get_or_create_entity(
    db: Session, user_id: uuid.UUID, name: str, entity_type: str, description: str | None
) -> KnowledgeEntity:
    existing = find_entity_by_name(db, user_id, name)
    if existing is not None:
        return existing
    entity = KnowledgeEntity(user_id=user_id, name=name, entity_type=entity_type, description=description)
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


def create_relationship(
    db: Session,
    user_id: uuid.UUID,
    source_entity_id: uuid.UUID,
    target_entity_id: uuid.UUID,
    relationship_type: str,
    description: str | None,
    source_id: uuid.UUID,
) -> KnowledgeRelationship:
    relationship = KnowledgeRelationship(
        user_id=user_id,
        source_entity_id=source_entity_id,
        target_entity_id=target_entity_id,
        relationship_type=relationship_type,
        description=description,
        source_id=source_id,
    )
    db.add(relationship)
    db.commit()
    db.refresh(relationship)
    return relationship


def search_entities_by_name(db: Session, user_id: uuid.UUID, query: str, limit: int = 3) -> list[KnowledgeEntity]:
    return list(
        db.scalars(
            select(KnowledgeEntity)
            .where(KnowledgeEntity.user_id == user_id, KnowledgeEntity.name.ilike(f"%{query}%"))
            .limit(limit)
        )
    )


def get_relationships_for_entity(db: Session, user_id: uuid.UUID, entity_id: uuid.UUID) -> list[KnowledgeRelationship]:
    """Both directions - an entity's relationships regardless of whether it
    was extracted as the source or the target of that edge."""
    return list(
        db.scalars(
            select(KnowledgeRelationship).where(
                KnowledgeRelationship.user_id == user_id,
                or_(
                    KnowledgeRelationship.source_entity_id == entity_id,
                    KnowledgeRelationship.target_entity_id == entity_id,
                ),
            )
        )
    )
