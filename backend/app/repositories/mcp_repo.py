import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.mcp_server import MCPServer, MCPTransport


def list_by_user(db: Session, user_id: uuid.UUID) -> list[MCPServer]:
    return list(db.scalars(select(MCPServer).where(MCPServer.user_id == user_id)))


def list_enabled_by_user(db: Session, user_id: uuid.UUID) -> list[MCPServer]:
    return list(
        db.scalars(select(MCPServer).where(MCPServer.user_id == user_id, MCPServer.is_enabled.is_(True)))
    )


def get_for_user(db: Session, server_id: uuid.UUID, user_id: uuid.UUID) -> MCPServer | None:
    return db.scalar(select(MCPServer).where(MCPServer.id == server_id, MCPServer.user_id == user_id))


def create(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    transport: MCPTransport,
    command: str | None,
    args: list | None,
    url: str | None,
    encrypted_env: str | None,
) -> MCPServer:
    server = MCPServer(
        user_id=user_id,
        name=name,
        transport=transport,
        command=command,
        args=args,
        url=url,
        encrypted_env=encrypted_env,
    )
    db.add(server)
    db.commit()
    db.refresh(server)
    return server


def set_enabled(db: Session, server_id: uuid.UUID, user_id: uuid.UUID, enabled: bool) -> MCPServer | None:
    server = get_for_user(db, server_id, user_id)
    if server is None:
        return None
    server.is_enabled = enabled
    db.commit()
    db.refresh(server)
    return server


def delete(db: Session, server_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    server = get_for_user(db, server_id, user_id)
    if server is None:
        return False
    db.delete(server)
    db.commit()
    return True
