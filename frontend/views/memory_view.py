import streamlit as st

import api_client
import session

_CATEGORY_ICONS = {"fact": "🧩", "preference": "❤️", "episodic": "🕐"}
_SOURCE_LABELS = {"auto": "🤖 auto-learned", "manual": "✍️ you told her"}


def _render_memory_row(token: str, memory: dict) -> None:
    icon = _CATEGORY_ICONS.get(memory["category"], "🧩")
    source_label = _SOURCE_LABELS.get(memory["source"], memory["source"])

    row_col, delete_col = st.columns([10, 1])
    with row_col:
        st.markdown(f"{icon} {memory['content']}")
        st.caption(f"{memory['category'].capitalize()} · {source_label}")
    with delete_col:
        if st.button("✕", key=f"delete_memory_{memory['id']}", help="Forget this"):
            try:
                api_client.delete_memory(token, memory["id"])
                st.rerun()
            except api_client.ApiError as exc:
                st.error(str(exc))


def render() -> None:
    token = session.get_token()
    st.title("Memory")
    st.caption(
        "What Missy has picked up about you from conversation, plus anything you've told her to remember. "
        "This is used silently in every chat - unlike the knowledge base, there's no toggle for it."
    )

    with st.expander("➕ Add something manually"):
        new_content = st.text_input("What should Missy remember?", key="new_memory_content")
        new_category = st.selectbox("Category", ["fact", "preference"], key="new_memory_category")
        if st.button("Save", key="add_memory_btn", disabled=not new_content.strip()):
            try:
                api_client.add_memory(token, new_content.strip(), new_category)
                st.success("Saved")
                st.rerun()
            except api_client.ApiError as exc:
                st.error(str(exc))

    st.divider()

    try:
        memories = api_client.list_memories(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    if not memories:
        st.info(
            "Nothing yet - Missy will pick things up automatically as you chat, "
            "or say 'remember that ...' in Chat, or add something above."
        )
        return

    for memory in memories:
        _render_memory_row(token, memory)
