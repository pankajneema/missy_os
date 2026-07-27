import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.llm_credential import LLMProvider


class ProviderSaveRequest(BaseModel):
    provider: LLMProvider
    api_key: str = Field(min_length=1)
    model_name: str = Field(min_length=1, max_length=128)


class ProviderResponse(BaseModel):
    id: uuid.UUID
    provider: LLMProvider
    masked_api_key: str
    model_name: str
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}
