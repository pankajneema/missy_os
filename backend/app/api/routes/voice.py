from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.voice import SpeakRequest, TranscribeResponse
from app.services import voice_service

router = APIRouter(prefix="/voice", tags=["voice"])

_MAX_AUDIO_BYTES = 15 * 1024 * 1024  # 15MB - generous for a short voice message


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TranscribeResponse:
    audio_bytes = await audio.read()
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio is too large (max 15MB).")
    text = voice_service.transcribe(db, current_user.id, audio.filename or "audio.wav", audio_bytes)
    return TranscribeResponse(text=text)


@router.post("/speak")
def speak(payload: SpeakRequest, current_user: User = Depends(get_current_user)) -> Response:
    audio_bytes = voice_service.speak(payload.text, payload.language)
    return Response(content=audio_bytes, media_type="audio/mpeg")
