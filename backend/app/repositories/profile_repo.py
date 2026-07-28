import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assistant_profile import AssistantProfile


def get_by_user_id(db: Session, user_id: uuid.UUID) -> AssistantProfile | None:
    return db.scalar(select(AssistantProfile).where(AssistantProfile.user_id == user_id))


def upsert(
    db: Session,
    user_id: uuid.UUID,
    assistant_name: str,
    persona_description: str,
    user_about_me: str,
    tone_preference: str | None,
    response_language: str,
) -> AssistantProfile:
    profile = get_by_user_id(db, user_id)
    if profile is None:
        profile = AssistantProfile(user_id=user_id)
        db.add(profile)

    profile.assistant_name = assistant_name
    profile.persona_description = persona_description
    profile.user_about_me = user_about_me
    profile.tone_preference = tone_preference
    profile.response_language = response_language

    db.commit()
    db.refresh(profile)
    return profile
