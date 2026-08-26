from datetime import datetime, time, timedelta, timezone

import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.tools import tool

from app.core.encryption import encrypt_secret
from app.models.assistant_profile import AssistantProfile
from app.models.llm_credential import LLMProvider
from app.models.message import MessageRole
from app.models.scheduled_task import ScheduleType
from app.models.user import User
from app.repositories import conversation_repo, credential_repo, message_repo
from app.services import scheduled_task_service

pytestmark = pytest.mark.anyio


def test_compute_next_run_at_for_daily_schedules_later_today_if_time_hasnt_passed():
    now = datetime(2026, 1, 1, 6, 0, tzinfo=timezone.utc)
    next_run = scheduled_task_service._compute_next_run_at(ScheduleType.daily, time(8, 0), None, now)
    assert next_run == datetime(2026, 1, 1, 8, 0, tzinfo=timezone.utc)


def test_compute_next_run_at_for_daily_rolls_to_tomorrow_if_time_already_passed():
    now = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    next_run = scheduled_task_service._compute_next_run_at(ScheduleType.daily, time(8, 0), None, now)
    assert next_run == datetime(2026, 1, 2, 8, 0, tzinfo=timezone.utc)


def test_compute_next_run_at_for_interval_adds_hours_to_now():
    now = datetime(2026, 1, 1, 6, 0, tzinfo=timezone.utc)
    next_run = scheduled_task_service._compute_next_run_at(ScheduleType.interval, None, 6, now)
    assert next_run == now + timedelta(hours=6)


def test_create_task_rejects_a_daily_task_without_a_time(db, user: User):
    with pytest.raises(Exception):
        scheduled_task_service.create_task(db, user.id, "do a thing", ScheduleType.daily, run_at_time=None)


def test_create_task_rejects_an_interval_task_without_hours(db, user: User):
    with pytest.raises(Exception):
        scheduled_task_service.create_task(db, user.id, "do a thing", ScheduleType.interval, interval_hours=None)


def test_create_list_enable_disable_and_delete_a_task(db, user: User):
    task = scheduled_task_service.create_task(db, user.id, "summarize my day", ScheduleType.daily, run_at_time=time(8, 0))
    assert task in scheduled_task_service.list_tasks(db, user.id)

    disabled = scheduled_task_service.set_enabled(db, user.id, task.id, False)
    assert disabled.enabled is False

    scheduled_task_service.delete_task(db, user.id, task.id)
    assert scheduled_task_service.list_tasks(db, user.id) == []


async def test_run_one_task_posts_prompt_and_result_into_the_scheduled_conversation(db, user: User, profile: AssistantProfile, monkeypatch):
    credential_repo.upsert(db, user.id, LLMProvider.groq, encrypt_secret("fake-key"), "llama-3.3-70b-versatile", None)

    class _FakeModel(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

        async def ainvoke(self, messages, config=None, **kwargs):
            return AIMessage(content="DIRECT")

        async def astream(self, messages, config=None, **kwargs):
            yield AIMessageChunk(content="Here's your daily summary.")

    monkeypatch.setattr("app.services.scheduled_task_service.build_chat_model", lambda *a, **k: _FakeModel(messages=iter([])))

    task = scheduled_task_service.create_task(db, user.id, "summarize my day", ScheduleType.daily, run_at_time=time(8, 0))
    await scheduled_task_service._run_one_task(db, task)

    conversation = next(c for c in conversation_repo.list_by_user(db, user.id) if c.title == "🗓️ Scheduled")
    messages = message_repo.list_by_conversation(db, conversation.id)
    assert any(m.role == MessageRole.user and "summarize my day" in m.content for m in messages)
    assert any(m.role == MessageRole.assistant and "daily summary" in m.content for m in messages)


async def test_run_one_task_auto_denies_a_risky_tool_and_says_so_in_the_result(db, user: User, profile: AssistantProfile, monkeypatch):
    credential_repo.upsert(db, user.id, LLMProvider.groq, encrypt_secret("fake-key"), "llama-3.3-70b-versatile", None)

    call_count = {"n": 0}

    @tool
    def risky_delete() -> str:
        """Deletes something."""
        call_count["n"] += 1
        return "deleted"

    risky_delete.metadata = {"readOnlyHint": False, "destructiveHint": True}

    class _FakeModel(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

        async def ainvoke(self, messages, config=None, **kwargs):
            return AIMessage(content="DIRECT")

        async def astream(self, messages, config=None, **kwargs):
            already_called = any(getattr(m, "tool_calls", None) for m in messages)
            if not already_called:
                yield AIMessageChunk(content="", tool_calls=[{"name": "risky_delete", "args": {}, "id": "c1"}])
            else:
                yield AIMessageChunk(content="Skipped the risky step.")

    async def _fake_get_mcp_tools(*a, **k):
        return [risky_delete]

    # risky_delete must come from the MCP side, not build_tools - a tool
    # build_tools returns would be counted as "native" (native tools are
    # never risky by definition, see is_tool_risky), which would make this
    # test pass for the wrong reason regardless of the unattended flag.
    monkeypatch.setattr("app.services.scheduled_task_service.build_chat_model", lambda *a, **k: _FakeModel(messages=iter([])))
    monkeypatch.setattr("app.services.scheduled_task_service.build_tools", lambda *a, **k: [])
    monkeypatch.setattr("app.services.mcp_service.get_mcp_tools", _fake_get_mcp_tools)

    task = scheduled_task_service.create_task(db, user.id, "clean up old files", ScheduleType.daily, run_at_time=time(8, 0))
    await scheduled_task_service._run_one_task(db, task)

    assert call_count["n"] == 0  # never actually ran, unattended
    conversation = next(c for c in conversation_repo.list_by_user(db, user.id) if c.title == "🗓️ Scheduled")
    messages = message_repo.list_by_conversation(db, conversation.id)
    assert any(m.role == MessageRole.assistant and "Skipped the risky step" in m.content for m in messages)


async def test_run_one_task_skips_cleanly_with_no_usable_credential(db, user: User, profile: AssistantProfile):
    task = scheduled_task_service.create_task(db, user.id, "summarize my day", ScheduleType.daily, run_at_time=time(8, 0))
    await scheduled_task_service._run_one_task(db, task)

    conversation = next(c for c in conversation_repo.list_by_user(db, user.id) if c.title == "🗓️ Scheduled")
    messages = message_repo.list_by_conversation(db, conversation.id)
    assert any(m.role == MessageRole.assistant and "Skipped" in m.content for m in messages)
