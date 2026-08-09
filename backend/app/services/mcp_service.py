import json
import uuid

from fastapi import HTTPException, status
from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient
from sqlalchemy.orm import Session

from app.core.encryption import decrypt_secret, encrypt_secret
from app.core.logging import get_logger
from app.models.mcp_server import MCPServer, MCPTransport
from app.repositories import mcp_repo

logger = get_logger(__name__)


def list_servers(db: Session, user_id: uuid.UUID) -> list[MCPServer]:
    return mcp_repo.list_by_user(db, user_id)


def add_server(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    transport: MCPTransport,
    command: str | None,
    args: list[str] | None,
    url: str | None,
    env: dict[str, str] | None,
) -> MCPServer:
    encrypted_env = encrypt_secret(json.dumps(env)) if env else None
    return mcp_repo.create(db, user_id, name, transport, command, args, url, encrypted_env)


def set_enabled(db: Session, user_id: uuid.UUID, server_id: uuid.UUID, enabled: bool) -> MCPServer:
    server = mcp_repo.set_enabled(db, server_id, user_id, enabled)
    if server is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found")
    return server


def delete_server(db: Session, user_id: uuid.UUID, server_id: uuid.UUID) -> None:
    if not mcp_repo.delete(db, server_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found")


def _connection_config(server: MCPServer) -> dict:
    env = json.loads(decrypt_secret(server.encrypted_env)) if server.encrypted_env else None
    if server.transport == MCPTransport.stdio:
        return {"transport": "stdio", "command": server.command, "args": server.args or [], "env": env}
    return {"transport": "sse", "url": server.url, "headers": env}


async def get_mcp_tools(db: Session, user_id: uuid.UUID) -> list[BaseTool]:
    """Pulls in tools from every MCP server the user has enabled, alongside
    the hand-written tools in app/ai/tools.py. Each server is connected to
    independently - one unreachable server (down, misconfigured, wrong
    command) shouldn't take the others down or block the chat turn."""
    servers = mcp_repo.list_enabled_by_user(db, user_id)
    if not servers:
        return []

    tools: list[BaseTool] = []
    for server in servers:
        client = MultiServerMCPClient({server.name: _connection_config(server)})
        try:
            tools.extend(await client.get_tools())
        except Exception:  # noqa: BLE001 - a broken MCP server must not break the chat turn
            logger.exception("Failed to connect to MCP server '%s' for user %s", server.name, user_id)
    return tools
