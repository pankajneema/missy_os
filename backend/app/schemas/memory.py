import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.memory_entry import MemoryCategory, MemorySource


class MemoryResponse(BaseModel):
    id: uuid.UUID
    content: str
    category: MemoryCategory
    source: MemorySource
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AddMemoryRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    category: MemoryCategory = MemoryCategory.fact
