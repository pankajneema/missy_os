import uuid

from sqlalchemy.orm import Session

from app.models.assistant_profile import AssistantProfile
from app.repositories import profile_repo


def get_profile(db: Session, user_id: uuid.UUID) -> AssistantProfile | None:
    return profile_repo.get_by_user_id(db, user_id)


def save_profile(
    db: Session,
    user_id: uuid.UUID,
    assistant_name: str,
    persona_description: str,
    user_about_me: str,
    tone_preference: str | None,
) -> AssistantProfile:
    return profile_repo.upsert(
        db,
        user_id=user_id,
        assistant_name=assistant_name,
        persona_description=persona_description,
        user_about_me=user_about_me,
        tone_preference=tone_preference,
    )
