import types

import pytest
from fastapi import HTTPException

from app.models.mcp_server import MCPTransport
from app.models.user import User
from app.services import mcp_service

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def _allow_stdio_servers(monkeypatch):
    """Stdio MCP servers are disabled unless an operator opts in via .env
    (see app/services/mcp_service.py) - every test in this file exercises
    real stdio behavior, so it's enabled here; the gate itself is tested
    explicitly below with this fixture bypassed per-test."""
    monkeypatch.setattr(
        "app.services.mcp_service.get_settings", lambda: types.SimpleNamespace(allow_mcp_stdio_servers=True)
    )


def test_add_server_rejects_stdio_by_default(db, user: User, monkeypatch):
    monkeypatch.setattr(
        "app.services.mcp_service.get_settings", lambda: types.SimpleNamespace(allow_mcp_stdio_servers=False)
    )

    with pytest.raises(HTTPException) as exc_info:
        mcp_service.add_server(
            db, user.id, name="scratch", transport=MCPTransport.stdio, command="npx", args=[], url=None, env=None
        )

    assert exc_info.value.status_code == 403


async def test_get_mcp_tools_connects_to_a_real_filesystem_server(db, user: User, tmp_path):
    (tmp_path / "hello.txt").write_text("the answer is 42")
    mcp_service.add_server(
        db, user.id,
        name="scratch",
        transport=MCPTransport.stdio,
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)],
        url=None,
        env=None,
    )

    tools = await mcp_service.get_mcp_tools(db, user.id)
    tools_by_name = {t.name: t for t in tools}

    assert "read_text_file" in tools_by_name
    result = await tools_by_name["read_text_file"].ainvoke({"path": str(tmp_path / "hello.txt")})
    # MCP tools return a list of content blocks (text/image/etc), not a plain
    # string - chat_service._stringify_tool_result() is what flattens this
    # for the model; here we're testing the raw MCP client, so unpack it directly.
    assert result[0]["text"] == "the answer is 42"


async def test_get_mcp_tools_skips_an_unreachable_server_without_raising(db, user: User):
    mcp_service.add_server(
        db, user.id,
        name="broken",
        transport=MCPTransport.stdio,
        command="this-command-does-not-exist",
        args=[],
        url=None,
        env=None,
    )

    tools = await mcp_service.get_mcp_tools(db, user.id)

    assert tools == []


async def test_get_mcp_tools_ignores_disabled_servers(db, user: User, tmp_path):
    server = mcp_service.add_server(
        db, user.id,
        name="scratch",
        transport=MCPTransport.stdio,
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)],
        url=None,
        env=None,
    )
    mcp_service.set_enabled(db, user.id, server.id, False)

    tools = await mcp_service.get_mcp_tools(db, user.id)

    assert tools == []
