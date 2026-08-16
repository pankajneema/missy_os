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


def get_any_usable_credential(db: Session, user_id: uuid.UUID) -> LLMCredential | None:
    """For background/best-effort work (like knowledge graph extraction on
    ingestion) that needs SOME working provider, not one the user picked for
    this specific call - prefers whichever is marked active (last used in
    chat), falling back to any other non-revoked credential."""
    credentials = [c for c in list_by_user(db, user_id) if not c.is_revoked]
    if not credentials:
        return None
    return next((c for c in credentials if c.is_active), credentials[0])


def upsert(
    db: Session,
    user_id: uuid.UUID,
    provider: LLMProvider,
    encrypted_api_key: str,
    model_name: str,
    name: str | None,
) -> LLMCredential:
    """Save or update a provider's credentials. Every saved provider is usable from
    the chat model picker - saving one does not affect any other provider."""
    credential = get_by_user_and_provider(db, user_id, provider)
    if credential is None:
        credential = LLMCredential(user_id=user_id, provider=provider)
        db.add(credential)

    credential.encrypted_api_key = encrypted_api_key
    credential.model_name = model_name
    credential.name = name

    db.commit()
    db.refresh(credential)
    return credential


def set_revoked(db: Session, user_id: uuid.UUID, provider: LLMProvider, revoked: bool) -> LLMCredential | None:
    credential = get_by_user_and_provider(db, user_id, provider)
    if credential is None:
        return None
    credential.is_revoked = revoked
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
