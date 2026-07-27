import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.message import Message, MessageRole


def list_by_conversation(db: Session, conversation_id: uuid.UUID) -> list[Message]:
    return list(
        db.scalars(
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
        )
    )


def create(db: Session, conversation_id: uuid.UUID, role: MessageRole, content: str) -> Message:
    message = Message(conversation_id=conversation_id, role=role, content=content)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def delete_by_conversation(db: Session, conversation_id: uuid.UUID) -> None:
    for message in list_by_conversation(db, conversation_id):
        db.delete(message)
    db.commit()
