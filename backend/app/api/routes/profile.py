from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.profile import ProfileResponse, ProfileUpsertRequest
from app.services import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ProfileResponse:
    profile = profile_service.get_profile(db, current_user.id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding not completed yet")
    return ProfileResponse.model_validate(profile)


@router.post("", response_model=ProfileResponse)
def save_profile(
    payload: ProfileUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    profile = profile_service.save_profile(
        db,
        user_id=current_user.id,
        assistant_name=payload.assistant_name,
        persona_description=payload.persona_description,
        user_about_me=payload.user_about_me,
        tone_preference=payload.tone_preference,
    )
    return ProfileResponse.model_validate(profile)
