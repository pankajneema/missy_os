import uuid

import pytest
from fastapi import HTTPException

from app.core.encryption import encrypt_secret
from app.models.assistant_profile import AssistantProfile
from app.models.llm_credential import LLMProvider
from app.models.user import User
from app.repositories import conversation_repo, credential_repo
from app.services import chat_service

pytestmark = pytest.mark.anyio


def _conversation(db, user: User):
    return conversation_repo.create(db, user.id)


def test_stringify_tool_result_flattens_mcp_content_blocks():
    mcp_style = [{"type": "text", "text": "the answer is 42", "id": "abc"}]
    assert chat_service._stringify_tool_result(mcp_style) == "the answer is 42"


def test_stringify_tool_result_joins_multiple_blocks():
    mcp_style = [{"type": "text", "text": "line one"}, {"type": "text", "text": "line two"}]
    assert chat_service._stringify_tool_result(mcp_style) == "line one\nline two"


def test_stringify_tool_result_passes_through_plain_strings():
    assert chat_service._stringify_tool_result("282") == "282"


async def test_send_message_rejects_a_revoked_credential(db, user: User, profile: AssistantProfile):
    credential_repo.upsert(db, user.id, LLMProvider.groq, encrypt_secret("fake-key"), "llama-3.3-70b-versatile", None)
    credential_repo.set_revoked(db, user.id, LLMProvider.groq, True)
    conversation = _conversation(db, user)

    with pytest.raises(HTTPException) as exc_info:
        await chat_service.send_message(db, user.id, conversation.id, "hello", LLMProvider.groq)

    assert exc_info.value.status_code == 400
    assert "revoked" in exc_info.value.detail.lower()


async def test_send_message_rejects_an_unconfigured_provider(db, user: User, profile: AssistantProfile):
    conversation = _conversation(db, user)

    with pytest.raises(HTTPException) as exc_info:
        await chat_service.send_message(db, user.id, conversation.id, "hello", LLMProvider.openai)

    assert exc_info.value.status_code == 400
    assert "isn't configured" in exc_info.value.detail


async def test_send_message_rejects_an_unknown_conversation(db, user: User, profile: AssistantProfile):
    with pytest.raises(HTTPException) as exc_info:
        await chat_service.send_message(db, user.id, uuid.uuid4(), "hello", LLMProvider.groq)

    assert exc_info.value.status_code == 404


async def test_send_message_requires_a_completed_profile(db, user: User):
    credential_repo.upsert(db, user.id, LLMProvider.groq, encrypt_secret("fake-key"), "llama-3.3-70b-versatile", None)
    conversation = _conversation(db, user)

    with pytest.raises(HTTPException) as exc_info:
        await chat_service.send_message(db, user.id, conversation.id, "hello", LLMProvider.groq)

    assert exc_info.value.status_code == 400
    assert "onboarding" in exc_info.value.detail.lower()
