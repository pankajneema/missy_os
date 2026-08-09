import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.llm_credential import LLMProvider


class ProviderSaveRequest(BaseModel):
    provider: LLMProvider
    api_key: str = Field(min_length=1)
    model_name: str = Field(min_length=1, max_length=128)
    name: str | None = Field(default=None, max_length=128)


class TestConnectionRequest(BaseModel):
    provider: LLMProvider
    api_key: str = Field(min_length=1)
    model_name: str = Field(min_length=1, max_length=128)


class TestConnectionResponse(BaseModel):
    success: bool
    message: str


class RevokeRequest(BaseModel):
    revoked: bool


class ProviderResponse(BaseModel):
    id: uuid.UUID
    name: str | None
    provider: LLMProvider
    masked_api_key: str
    model_name: str
    is_active: bool
    is_revoked: bool
    updated_at: datetime

    model_config = {"from_attributes": True}
