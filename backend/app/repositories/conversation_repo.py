import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation


def list_by_user(db: Session, user_id: uuid.UUID) -> list[Conversation]:
    return list(
        db.scalars(
            select(Conversation).where(Conversation.user_id == user_id).order_by(Conversation.created_at.desc())
        )
    )


def get_by_id_for_user(db: Session, conversation_id: uuid.UUID, user_id: uuid.UUID) -> Conversation | None:
    return db.scalar(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    )


def create(db: Session, user_id: uuid.UUID, title: str = "New Chat") -> Conversation:
    conversation = Conversation(user_id=user_id, title=title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def update_summary(
    db: Session, conversation: Conversation, summary: str, summarized_through_message_id: uuid.UUID
) -> Conversation:
    conversation.summary = summary
    conversation.summarized_through_message_id = summarized_through_message_id
    db.commit()
    db.refresh(conversation)
    return conversation
