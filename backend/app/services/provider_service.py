import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

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
    db: Session, user_id: uuid.UUID, provider: LLMProvider, api_key: str, model_name: str
) -> LLMCredential:
    encrypted = encrypt_secret(api_key)
    return credential_repo.upsert(
        db, user_id=user_id, provider=provider, encrypted_api_key=encrypted, model_name=model_name
    )


def delete_provider(db: Session, user_id: uuid.UUID, provider: LLMProvider) -> None:
    deleted = credential_repo.delete(db, user_id, provider)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That provider isn't configured")
