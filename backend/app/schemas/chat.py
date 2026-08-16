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


class ConfirmationResponse(BaseModel):
    id: uuid.UUID
    tool_name: str
    tool_args: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class ConfirmToolRequest(BaseModel):
    approved: bool
