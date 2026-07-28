import streamlit as st

import api_client
import session

_STATUS_BADGES = {"ready": "🟢 Ready", "processing": "🟡 Processing", "failed": "🔴 Failed"}
_TYPE_ICONS = {"file": "📄", "url": "🔗", "text": "📝"}


def _render_source_row(token: str, source: dict) -> None:
    icon = _TYPE_ICONS.get(source["source_type"], "📄")
    badge = _STATUS_BADGES.get(source["status"], source["status"])

    row_col, delete_col = st.columns([10, 1])
    with row_col:
        st.markdown(f"{icon} **{source['title']}**")
        caption = f"{badge} · {source['chunk_count']} chunks"
        if source["status"] == "failed" and source["error_message"]:
            caption += f" · {source['error_message']}"
        st.caption(caption)
    with delete_col:
        if st.button("✕", key=f"delete_source_{source['id']}", help="Remove from knowledge base"):
            try:
                api_client.delete_knowledge_source(token, source["id"])
                st.rerun()
            except api_client.ApiError as exc:
                st.error(str(exc))


def render() -> None:
    token = session.get_token()
    st.title("Knowledge Base")
    st.caption("Add files, web pages, or notes once - Missy can search across all of them in any conversation.")

    file_tab, url_tab, note_tab = st.tabs(["📄 File", "🔗 URL", "📝 Note"])

    with file_tab:
        uploaded = st.file_uploader("Upload a PDF, DOCX, TXT, or MD file", type=["pdf", "docx", "txt", "md"])
        if st.button("Add file", key="add_file_btn", disabled=uploaded is None):
            with st.spinner(f"Reading and indexing {uploaded.name}..."):
                try:
                    api_client.add_knowledge_file(token, uploaded.name, uploaded.getvalue())
                    st.success(f"Added {uploaded.name}")
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))

    with url_tab:
        url = st.text_input("Web page URL", placeholder="https://example.com/article")
        if st.button("Add URL", key="add_url_btn", disabled=not url.strip()):
            with st.spinner("Fetching and indexing the page..."):
                try:
                    api_client.add_knowledge_url(token, url.strip())
                    st.success("Added")
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))

    with note_tab:
        note_title = st.text_input("Title", key="note_title", placeholder="e.g. Project notes")
        note_content = st.text_area("Content", key="note_content", height=150)
        if st.button("Add note", key="add_note_btn", disabled=not (note_title.strip() and note_content.strip())):
            with st.spinner("Indexing your note..."):
                try:
                    api_client.add_knowledge_note(token, note_title.strip(), note_content)
                    st.success("Added")
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))

    st.divider()
    st.subheader("Your sources")

    try:
        sources = api_client.list_knowledge_sources(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    if not sources:
        st.info("Nothing added yet - use the tabs above to build your knowledge base.")
        return

    for source in sources:
        _render_source_row(token, source)
