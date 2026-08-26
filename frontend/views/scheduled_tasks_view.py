from datetime import time

import streamlit as st

import api_client
import session


def _render_add_form(token: str) -> None:
    with st.expander("➕ Add a scheduled task", expanded=False):
        st.caption(
            "Missy will run this prompt on her own, on the schedule below - results show up in \"Recent runs\" "
            "below once they've run. Any risky tool the prompt triggers (file writes, deletes, etc.) is "
            "automatically skipped, since there's nobody around to approve it."
        )
        prompt = st.text_area(
            "Prompt", placeholder="e.g. Summarize what's on my plate today", key="new_task_prompt"
        )
        schedule_type = st.radio(
            "Schedule", ["Daily at a time", "Every N hours"], key="new_task_schedule_type", horizontal=True
        )

        run_at_time, interval_hours = None, None
        if schedule_type == "Daily at a time":
            run_at_time = st.time_input("Time (UTC)", value=time(8, 0), key="new_task_time")
        else:
            interval_hours = st.number_input(
                "Every how many hours", min_value=1, max_value=168, value=6, step=1, key="new_task_interval"
            )

        if st.button("Save", key="new_task_save", use_container_width=True):
            if not prompt.strip():
                st.error("Give the task a prompt.")
                return
            try:
                api_client.add_scheduled_task(
                    token,
                    prompt=prompt.strip(),
                    schedule_type="daily" if schedule_type == "Daily at a time" else "interval",
                    run_at_time=run_at_time.strftime("%H:%M:%S") if run_at_time else None,
                    interval_hours=int(interval_hours) if interval_hours else None,
                )
                st.success("✅ Scheduled.")
                st.rerun()
            except api_client.ApiError as exc:
                st.error(str(exc))


def _schedule_caption(task: dict) -> str:
    if task["schedule_type"] == "daily":
        return f"Daily at {task['run_at_time']} UTC"
    return f"Every {task['interval_hours']}h"


def _render_task_row(token: str, task: dict) -> None:
    with st.container(border=True):
        prompt_col, status_col = st.columns([5, 2])
        prompt_col.markdown(f"**⏰ {task['prompt']}**")
        prompt_col.caption(
            f"{_schedule_caption(task)} · next run {task['next_run_at']}"
            + (f" · last ran {task['last_run_at']}" if task["last_run_at"] else "")
        )
        status_col.markdown("🟢 Enabled" if task["enabled"] else "⚪ Disabled")

        toggle_col, delete_col = st.columns(2)
        if task["enabled"]:
            if toggle_col.button("Disable", key=f"disable_task_{task['id']}", use_container_width=True):
                try:
                    api_client.set_scheduled_task_enabled(token, task["id"], False)
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))
        else:
            if toggle_col.button("Enable", key=f"enable_task_{task['id']}", use_container_width=True):
                try:
                    api_client.set_scheduled_task_enabled(token, task["id"], True)
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))

        if delete_col.button("Delete", key=f"delete_task_{task['id']}", use_container_width=True):
            st.session_state[f"confirm_delete_task_{task['id']}"] = True

        confirm_key = f"confirm_delete_task_{task['id']}"
        if st.session_state.get(confirm_key):
            st.warning("Permanently delete this scheduled task?")
            yes_col, no_col = st.columns(2)
            if yes_col.button("Yes, delete", key=f"confirm_yes_task_{task['id']}", use_container_width=True):
                try:
                    api_client.delete_scheduled_task(token, task["id"])
                except api_client.ApiError as exc:
                    st.error(str(exc))
                else:
                    st.session_state[confirm_key] = False
                    st.rerun()
            if no_col.button("Cancel", key=f"confirm_no_task_{task['id']}", use_container_width=True):
                st.session_state[confirm_key] = False
                st.rerun()


_SCHEDULED_CONVERSATION_TITLE = "🗓️ Scheduled"
_MAX_RUNS_SHOWN = 10


def _render_recent_runs(token: str) -> None:
    try:
        conversations = api_client.list_conversations(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    scheduled = next((c for c in conversations if c["title"] == _SCHEDULED_CONVERSATION_TITLE), None)
    if scheduled is None:
        return  # no scheduled task has ever run yet - nothing to show

    st.subheader("Recent runs")
    try:
        messages = api_client.get_messages(token, scheduled["id"])
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    # Newest first, and paired: each run is a (prompt, result) message pair.
    for i in range(len(messages) - 1, 0, -2):
        prompt_message, result_message = messages[i - 1], messages[i]
        with st.container(border=True):
            st.caption(prompt_message["content"])
            st.markdown(result_message["content"])
        if (len(messages) - i) // 2 + 1 >= _MAX_RUNS_SHOWN:
            break


def render() -> None:
    token = session.get_token()
    st.title("Scheduled Tasks")
    st.caption("Give Missy prompts to run on her own, without you sending a message - a step toward an assistant that acts, not just replies.")

    _render_add_form(token)
    st.divider()

    try:
        tasks = api_client.list_scheduled_tasks(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    if not tasks:
        st.info("No scheduled tasks yet - use \"Add a scheduled task\" above.")
        return

    for task in tasks:
        _render_task_row(token, task)

    st.divider()
    _render_recent_runs(token)
