import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.knowledge_source import SourceStatus, SourceType


class SourceResponse(BaseModel):
    id: uuid.UUID
    title: str
    source_type: SourceType
    original_reference: str | None
    status: SourceStatus
    error_message: str | None
    chunk_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AddNoteRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=200_000)


class AddUrlRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
