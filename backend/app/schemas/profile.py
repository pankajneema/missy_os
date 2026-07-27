from pydantic import BaseModel, Field


class ProfileUpsertRequest(BaseModel):
    assistant_name: str = Field(default="Missy", min_length=1, max_length=64)
    persona_description: str = Field(min_length=1, max_length=2000)
    user_about_me: str = Field(min_length=1, max_length=2000)
    tone_preference: str | None = Field(default=None, max_length=64)


class ProfileResponse(BaseModel):
    assistant_name: str
    persona_description: str
    user_about_me: str
    tone_preference: str | None

    model_config = {"from_attributes": True}
