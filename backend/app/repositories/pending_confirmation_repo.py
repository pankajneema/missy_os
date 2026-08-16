import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.llm_credential import LLMProvider
from app.models.pending_confirmation import PendingToolConfirmation


def get_for_conversation(
    db: Session, confirmation_id: uuid.UUID, conversation_id: uuid.UUID
) -> PendingToolConfirmation | None:
    return db.scalar(
        select(PendingToolConfirmation).where(
            PendingToolConfirmation.id == confirmation_id,
            PendingToolConfirmation.conversation_id == conversation_id,
        )
    )


def get_latest_for_conversation(db: Session, conversation_id: uuid.UUID) -> PendingToolConfirmation | None:
    """A conversation has at most one open confirmation at a time in
    practice (Chat blocks new messages while one's pending), but this is
    what lets the frontend recover it after a page reload - session_state
    alone doesn't survive that, the DB row does."""
    return db.scalar(
        select(PendingToolConfirmation)
        .where(PendingToolConfirmation.conversation_id == conversation_id)
        .order_by(PendingToolConfirmation.created_at.desc())
        .limit(1)
    )


def create(
    db: Session,
    conversation_id: uuid.UUID,
    user_message_id: uuid.UUID,
    thread_id: str,
    provider: LLMProvider,
    tool_name: str,
    tool_args: dict,
) -> PendingToolConfirmation:
    confirmation = PendingToolConfirmation(
        conversation_id=conversation_id,
        user_message_id=user_message_id,
        thread_id=thread_id,
        provider=provider,
        tool_name=tool_name,
        tool_args=tool_args,
    )
    db.add(confirmation)
    db.commit()
    db.refresh(confirmation)
    return confirmation


def delete(db: Session, confirmation: PendingToolConfirmation) -> None:
    db.delete(confirmation)
    db.commit()
