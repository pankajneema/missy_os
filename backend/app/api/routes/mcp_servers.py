import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.mcp_server import MCPServerCreateRequest, MCPServerEnabledRequest, MCPServerResponse
from app.services import mcp_service

router = APIRouter(prefix="/mcp-servers", tags=["mcp"])


@router.get("", response_model=list[MCPServerResponse])
def list_servers(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MCPServerResponse]:
    return [MCPServerResponse.model_validate(s) for s in mcp_service.list_servers(db, current_user.id)]


@router.post("", response_model=MCPServerResponse)
def add_server(
    payload: MCPServerCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MCPServerResponse:
    server = mcp_service.add_server(
        db,
        user_id=current_user.id,
        name=payload.name,
        transport=payload.transport,
        command=payload.command,
        args=payload.args,
        url=payload.url,
        env=payload.env,
    )
    return MCPServerResponse.model_validate(server)


@router.post("/{server_id}/enabled", response_model=MCPServerResponse)
def set_enabled(
    server_id: uuid.UUID,
    payload: MCPServerEnabledRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MCPServerResponse:
    server = mcp_service.set_enabled(db, current_user.id, server_id, payload.enabled)
    return MCPServerResponse.model_validate(server)


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_server(
    server_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    mcp_service.delete_server(db, current_user.id, server_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
