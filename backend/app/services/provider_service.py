import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.ai.model_factory import build_chat_model
from app.core.encryption import decrypt_secret, encrypt_secret, mask_secret
from app.models.llm_credential import LLMCredential, LLMProvider
from app.repositories import credential_repo


def list_providers(db: Session, user_id: uuid.UUID) -> list[tuple[LLMCredential, str]]:
    """Returns (credential, masked_api_key) pairs.

    The key is decrypted only transiently to compute the mask (e.g. "****ab12")
    for display - the plaintext is never logged or sent to the frontend.
    """
    result = []
    for credential in credential_repo.list_by_user(db, user_id):
        plain_key = decrypt_secret(credential.encrypted_api_key)
        result.append((credential, mask_secret(plain_key)))
    return result


def save_provider(
    db: Session, user_id: uuid.UUID, provider: LLMProvider, api_key: str, model_name: str, name: str | None = None
) -> LLMCredential:
    encrypted = encrypt_secret(api_key)
    return credential_repo.upsert(
        db, user_id=user_id, provider=provider, encrypted_api_key=encrypted, model_name=model_name, name=name
    )


def delete_provider(db: Session, user_id: uuid.UUID, provider: LLMProvider) -> None:
    deleted = credential_repo.delete(db, user_id, provider)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That provider isn't configured")


def set_revoked(db: Session, user_id: uuid.UUID, provider: LLMProvider, revoked: bool) -> LLMCredential:
    credential = credential_repo.set_revoked(db, user_id, provider, revoked)
    if credential is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That provider isn't configured")
    return credential


def test_connection(provider: LLMProvider, api_key: str, model_name: str) -> tuple[bool, str]:
    """A real, minimal call to the provider - this is what catches a wrong
    credential type (e.g. an OAuth token instead of an API key) immediately,
    with a clear message, instead of a confusing failure mid-chat later."""
    try:
        chat_model = build_chat_model(provider, model_name, api_key)
        chat_model.invoke("Say OK.")
    except Exception as exc:  # noqa: BLE001 - any failure means "not working", surface it plainly
        return False, str(exc)
    return True, "Connection verified."
