import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPrimaryKeyMixin


class MCPTransport(str, enum.Enum):
    stdio = "stdio"
    sse = "sse"


class MCPServer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A user-configured MCP server - local (stdio, a spawned command) or
    remote (SSE, a URL). Tools it exposes are pulled in alongside the native
    tools in app/ai/tools.py at chat time (see app/services/mcp_service.py)."""

    __tablename__ = "mcp_servers"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    transport: Mapped[MCPTransport] = mapped_column(Enum(MCPTransport, name="mcp_transport"), nullable=False)

    # stdio only - a local command Missy spawns as a subprocess
    command: Mapped[str | None] = mapped_column(String(512), nullable=True)
    args: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # sse only - a remote MCP endpoint
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # Fernet-encrypted JSON blob: stdio env vars or sse headers, whichever
    # applies - same "never store secrets in plaintext" rule as LLM API keys.
    encrypted_env: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship()
