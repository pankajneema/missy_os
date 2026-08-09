import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.mcp_server import MCPTransport


class MCPServerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    transport: MCPTransport
    command: str | None = None
    args: list[str] | None = None
    url: str | None = None
    env: dict[str, str] | None = None  # stdio env vars OR sse headers, by transport

    @model_validator(mode="after")
    def _validate_transport_fields(self) -> "MCPServerCreateRequest":
        if self.transport == MCPTransport.stdio and not self.command:
            raise ValueError("A stdio server needs a command.")
        if self.transport == MCPTransport.sse and not self.url:
            raise ValueError("A remote (SSE) server needs a URL.")
        return self


class MCPServerEnabledRequest(BaseModel):
    enabled: bool


class MCPServerResponse(BaseModel):
    id: uuid.UUID
    name: str
    transport: MCPTransport
    command: str | None
    args: list | None
    url: str | None
    is_enabled: bool
    created_at: datetime

    model_config = {"from_attributes": True}
