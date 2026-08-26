import uuid
from datetime import datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.memory import InMemorySaver
from sqlalchemy.orm import Session, sessionmaker

from app.ai.graph import build_graph
from app.ai.model_factory import build_chat_model
from app.ai.prompts import build_system_prompt
from app.ai.tools import build_tools
from app.core.encryption import decrypt_secret
from app.core.logging import get_logger
from app.models.conversation import Conversation
from app.models.message import MessageRole
from app.models.scheduled_task import ScheduledTask, ScheduleType
from app.repositories import conversation_repo, credential_repo, message_repo, profile_repo, scheduled_task_repo
from app.services import mcp_service

logger = get_logger(__name__)

_SCHEDULED_CONVERSATION_TITLE = "🗓️ Scheduled"
_RECURSION_LIMIT = 30


def _compute_next_run_at(
    schedule_type: ScheduleType, run_at_time: time | None, interval_hours: int | None, now: datetime
) -> datetime:
    """Always anchored from `now`, not from the previous next_run_at - if the
    app was down for a stretch (has happened - see the Docker incident),
    this gives one catch-up run next tick instead of a burst of missed runs
    firing back-to-back."""
    if schedule_type == ScheduleType.interval:
        return now + timedelta(hours=interval_hours)
    candidate = now.replace(hour=run_at_time.hour, minute=run_at_time.minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


def list_tasks(db: Session, user_id: uuid.UUID) -> list[ScheduledTask]:
    return scheduled_task_repo.list_by_user(db, user_id)


def create_task(
    db: Session,
    user_id: uuid.UUID,
    prompt: str,
    schedule_type: ScheduleType,
    run_at_time: time | None = None,
    interval_hours: int | None = None,
) -> ScheduledTask:
    if schedule_type == ScheduleType.daily and run_at_time is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A daily task needs a time of day.")
    if schedule_type == ScheduleType.interval and not interval_hours:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An interval task needs an hour count.")

    now = datetime.now(timezone.utc)
    next_run_at = _compute_next_run_at(schedule_type, run_at_time, interval_hours, now)
    return scheduled_task_repo.create(db, user_id, prompt, schedule_type, run_at_time, interval_hours, next_run_at)


def set_enabled(db: Session, user_id: uuid.UUID, task_id: uuid.UUID, enabled: bool) -> ScheduledTask:
    task = scheduled_task_repo.get_by_id_for_user(db, task_id, user_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheduled task not found")
    return scheduled_task_repo.set_enabled(db, task, enabled)


def delete_task(db: Session, user_id: uuid.UUID, task_id: uuid.UUID) -> None:
    task = scheduled_task_repo.get_by_id_for_user(db, task_id, user_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheduled task not found")
    scheduled_task_repo.delete(db, task)


def _get_or_create_scheduled_conversation(db: Session, user_id: uuid.UUID) -> Conversation:
    existing = next(
        (c for c in conversation_repo.list_by_user(db, user_id) if c.title == _SCHEDULED_CONVERSATION_TITLE), None
    )
    return existing or conversation_repo.create(db, user_id, title=_SCHEDULED_CONVERSATION_TITLE)


async def _run_one_task(db: Session, task: ScheduledTask) -> None:
    """Runs one due task's prompt through the real agent, unattended - any
    risky tool call is auto-denied rather than paused on a confirmation
    nobody is present to answer (build_graph's unattended=True). Never
    raises: a broken run (bad credential, provider error) still gets its
    result posted and its next_run_at advanced by the caller, so a single
    failure can't turn into a minute-by-minute retry loop forever."""
    conversation = _get_or_create_scheduled_conversation(db, task.user_id)
    message_repo.create(db, conversation.id, MessageRole.user, f"⏰ {task.prompt}")

    credential = credential_repo.get_any_usable_credential(db, task.user_id)
    profile = profile_repo.get_by_user_id(db, task.user_id)
    if credential is None or profile is None:
        reason = "no usable API connection is configured" if credential is None else "onboarding isn't complete"
        message_repo.create(db, conversation.id, MessageRole.assistant, f"⚠️ Skipped this scheduled run - {reason}.")
        logger.warning("Scheduled task %s skipped for user %s - %s", task.id, task.user_id, reason)
        return

    try:
        api_key = decrypt_secret(credential.encrypted_api_key)
        chat_model = build_chat_model(credential.provider, credential.model_name, api_key)
        tools = build_tools(db, task.user_id)
        native_tool_names = {t.name for t in tools}
        tools.extend(await mcp_service.get_mcp_tools(db, task.user_id))

        checkpointer = InMemorySaver()
        graph = build_graph(checkpointer, chat_model, tools, task.user_id, native_tool_names, unattended=True)
        messages = [SystemMessage(content=build_system_prompt(profile)), HumanMessage(content=task.prompt)]
        config = {"configurable": {"thread_id": str(uuid.uuid4())}, "recursion_limit": _RECURSION_LIMIT}

        final_state = await graph.ainvoke({"messages": messages}, config=config)
        final_content = final_state["messages"][-1].content
    except Exception as exc:  # noqa: BLE001 - a broken scheduled run must not crash the loop
        logger.exception("Scheduled task %s failed for user %s", task.id, task.user_id)
        final_content = f"⚠️ This scheduled run failed: {exc}"

    message_repo.create(db, conversation.id, MessageRole.assistant, final_content)


async def run_due_tasks(session_factory: sessionmaker) -> int:
    """Called once a minute by the background loop in app/core/scheduler.py.
    Opens a fresh, short-lived session per task rather than one held for the
    whole tick - a slow LLM call on one task shouldn't hold a DB connection
    (or a stale view of `now`) for every other task in the same tick."""
    now = datetime.now(timezone.utc)
    db = session_factory()
    try:
        task_ids = [t.id for t in scheduled_task_repo.list_due(db, now)]
    finally:
        db.close()

    for task_id in task_ids:
        db = session_factory()
        try:
            task = scheduled_task_repo.get_by_id(db, task_id)
            if task is None or not task.enabled:
                continue
            await _run_one_task(db, task)
            next_run_at = _compute_next_run_at(
                task.schedule_type, task.run_at_time, task.interval_hours, datetime.now(timezone.utc)
            )
            scheduled_task_repo.record_run(db, task, datetime.now(timezone.utc), next_run_at)
        finally:
            db.close()

    return len(task_ids)
