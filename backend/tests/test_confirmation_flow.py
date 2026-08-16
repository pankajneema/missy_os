import uuid

import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, AIMessageChunk

from app.core.encryption import encrypt_secret
from app.models.assistant_profile import AssistantProfile
from app.models.llm_credential import LLMProvider
from app.models.mcp_server import MCPTransport
from app.models.user import User
from app.repositories import conversation_repo, credential_repo
from app.services import chat_service, mcp_service

pytestmark = pytest.mark.anyio


class _FakeToolCallingModel(GenericFakeChatModel):
    """Ignores its scripted `messages` entirely - always requests `tool_call`
    on the first turn, then answers in plain text once it sees the result.
    These tests exercise the confirmation flow specifically through the
    direct/agent path, so the supervisor's classification call is always
    answered DIRECT - routing behavior itself is covered separately."""

    tool_call: dict

    def bind_tools(self, tools, **kwargs):
        return self

    async def ainvoke(self, messages, config=None, **kwargs):
        return AIMessage(content="DIRECT")

    async def astream(self, messages, config=None, **kwargs):
        # A single chunk per call - no accumulation math to get right, since
        # graph.py's _stream_and_accumulate only merges when there's more than one.
        already_called = any(getattr(m, "tool_calls", None) for m in messages)
        if not already_called:
            yield AIMessageChunk(content="", tool_calls=[self.tool_call])
        else:
            last = messages[-1]
            yield AIMessageChunk(content=f"Turn finished. Tool said: {last.content}")


async def _collect(events) -> list[dict]:
    return [event async for event in events]


async def _setup(db, user: User, tmp_path, tool_call: dict):
    mcp_service.add_server(
        db, user.id,
        name="scratch",
        transport=MCPTransport.stdio,
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", str(tmp_path)],
        url=None,
        env=None,
    )
    credential_repo.upsert(db, user.id, LLMProvider.groq, encrypt_secret("fake-key"), "llama-3.3-70b-versatile", None)
    conversation = conversation_repo.create(db, user.id)

    fake_model = _FakeToolCallingModel(messages=iter([]), tool_call=tool_call)

    def fake_build_chat_model(provider, model_name, api_key):
        return fake_model

    return conversation, fake_build_chat_model


async def test_a_risky_tool_call_pauses_for_confirmation(
    db, user: User, profile: AssistantProfile, checkpointer, tmp_path, monkeypatch
):
    target = tmp_path / "notes.txt"
    tool_call = {
        "name": "write_file",
        "args": {"path": str(target), "content": "hello from missy"},
        "id": "call_1",
    }
    conversation, fake_build_chat_model = await _setup(db, user, tmp_path, tool_call)
    monkeypatch.setattr("app.services.chat_service.build_chat_model", fake_build_chat_model)

    events = await _collect(
        await chat_service.prepare_send(db, user.id, conversation.id, "write a note for me", LLMProvider.groq, checkpointer)
    )

    assert events[-1]["type"] == "needs_confirmation"
    assert events[-1]["confirmation"]["tool_name"] == "write_file"
    assert not target.exists()  # must not have run yet

    # the user's turn is visible immediately, without the (not-yet-known) tool marker
    messages = chat_service.get_conversation_messages(db, user.id, conversation.id)
    assert len(messages) == 1
    assert messages[0].content == "write a note for me"


async def test_approving_the_confirmation_runs_the_tool_and_finishes_the_turn(
    db, user: User, profile: AssistantProfile, checkpointer, tmp_path, monkeypatch
):
    target = tmp_path / "notes.txt"
    tool_call = {"name": "write_file", "args": {"path": str(target), "content": "hello from missy"}, "id": "call_1"}
    conversation, fake_build_chat_model = await _setup(db, user, tmp_path, tool_call)
    monkeypatch.setattr("app.services.chat_service.build_chat_model", fake_build_chat_model)

    send_events = await _collect(
        await chat_service.prepare_send(db, user.id, conversation.id, "write a note for me", LLMProvider.groq, checkpointer)
    )
    confirmation_id = uuid.UUID(send_events[-1]["confirmation"]["id"])

    confirm_events = await _collect(
        await chat_service.prepare_confirm(db, user.id, conversation.id, confirmation_id, True, checkpointer)
    )

    assert target.read_text() == "hello from missy"  # the real side effect actually happened
    assert confirm_events[-1]["type"] == "done"
    assert confirm_events[-1]["message"]["content"].startswith("Turn finished.")

    messages = chat_service.get_conversation_messages(db, user.id, conversation.id)
    assert "🔧 [Used: write_file]" in messages[0].content  # marker patched in after the fact


async def test_denying_the_confirmation_skips_the_tool(
    db, user: User, profile: AssistantProfile, checkpointer, tmp_path, monkeypatch
):
    target = tmp_path / "notes.txt"
    tool_call = {"name": "write_file", "args": {"path": str(target), "content": "hello from missy"}, "id": "call_1"}
    conversation, fake_build_chat_model = await _setup(db, user, tmp_path, tool_call)
    monkeypatch.setattr("app.services.chat_service.build_chat_model", fake_build_chat_model)

    send_events = await _collect(
        await chat_service.prepare_send(db, user.id, conversation.id, "write a note for me", LLMProvider.groq, checkpointer)
    )
    confirmation_id = uuid.UUID(send_events[-1]["confirmation"]["id"])

    confirm_events = await _collect(
        await chat_service.prepare_confirm(db, user.id, conversation.id, confirmation_id, False, checkpointer)
    )

    assert not target.exists()  # denied - never ran
    assert confirm_events[-1]["type"] == "done"
    assert "denied permission" in confirm_events[-1]["message"]["content"].lower()
