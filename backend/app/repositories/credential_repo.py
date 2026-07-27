import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.llm_credential import LLMCredential, LLMProvider


def list_by_user(db: Session, user_id: uuid.UUID) -> list[LLMCredential]:
    return list(db.scalars(select(LLMCredential).where(LLMCredential.user_id == user_id)))


def get_by_user_and_provider(db: Session, user_id: uuid.UUID, provider: LLMProvider) -> LLMCredential | None:
    return db.scalar(
        select(LLMCredential).where(
            LLMCredential.user_id == user_id, LLMCredential.provider == provider
        )
    )


def upsert(
    db: Session, user_id: uuid.UUID, provider: LLMProvider, encrypted_api_key: str, model_name: str
) -> LLMCredential:
    """Save or update a provider's credentials. Every saved provider is usable from
    the chat model picker - saving one does not affect any other provider."""
    credential = get_by_user_and_provider(db, user_id, provider)
    if credential is None:
        credential = LLMCredential(user_id=user_id, provider=provider)
        db.add(credential)

    credential.encrypted_api_key = encrypted_api_key
    credential.model_name = model_name

    db.commit()
    db.refresh(credential)
    return credential


def set_last_used(db: Session, user_id: uuid.UUID, provider: LLMProvider) -> None:
    """Remembers which provider was picked in chat, so it's pre-selected next time."""
    for credential in list_by_user(db, user_id):
        credential.is_active = credential.provider == provider
    db.commit()


def delete(db: Session, user_id: uuid.UUID, provider: LLMProvider) -> bool:
    credential = get_by_user_and_provider(db, user_id, provider)
    if credential is None:
        return False
    db.delete(credential)
    db.commit()
    return True
