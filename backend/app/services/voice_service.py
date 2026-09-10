import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.ai.speech import synthesize_speech
from app.ai.transcription import transcribe_audio
from app.core.encryption import decrypt_secret
from app.models.llm_credential import LLMProvider
from app.repositories import credential_repo, profile_repo


def transcribe(db: Session, user_id: uuid.UUID, filename: str, audio_bytes: bytes) -> str:
    credential = credential_repo.get_by_user_and_provider(db, user_id, LLMProvider.groq)
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voice input needs Groq configured in Settings (it powers transcription).",
        )
    api_key = decrypt_secret(credential.encrypted_api_key)
    try:
        profile = profile_repo.get_by_user_id(db, user_id)
        return transcribe_audio(api_key, filename, audio_bytes, profile.response_language if profile else None)
    except Exception as exc:  # noqa: BLE001 - surface a clean error, not a raw traceback
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Transcription failed: {exc}") from exc


def speak(text: str, language: str) -> bytes:
    try:
        return synthesize_speech(text, language)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Speech synthesis failed: {exc}") from exc
