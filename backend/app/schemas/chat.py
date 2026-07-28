import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.message import MessageRole


class ConversationResponse(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: uuid.UUID
    role: MessageRole
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}
