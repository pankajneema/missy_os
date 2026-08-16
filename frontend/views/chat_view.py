import streamlit as st

import api_client
import session

_PROVIDER_LABELS = {"openai": "OpenAI", "anthropic": "Anthropic", "gemini": "Gemini", "groq": "Groq"}
_IMAGE_EXTS = {"png", "jpg", "jpeg", "webp"}
_DOCUMENT_EXTS = {"pdf", "docx", "txt", "md"}
_FINAL_EVENT_TYPES = {"done", "needs_confirmation", "error"}


def _get_primary_conversation(token: str) -> dict:
    """Missy is one assistant, not a set of separate chat threads - every
    user gets exactly one persistent conversation. If more than one exists
    (e.g. from earlier testing), we stick to the oldest for continuity."""
    conversations = api_client.list_conversations(token)
    if not conversations:
        return api_client.create_conversation(token)
    return min(conversations, key=lambda c: c["created_at"])


def _bump_attachment_version() -> None:
    # There's no direct "clear" API for file_uploader/audio_input - giving
    # them a fresh key on the next render is what resets them.
    st.session_state["attach_version"] = st.session_state.get("attach_version", 0) + 1


def _is_image(filename: str) -> bool:
    return filename.rsplit(".", 1)[-1].lower() in _IMAGE_EXTS


def _store_final_event(event: dict) -> None:
    """A turn either finishes normally, or pauses because the model wants to
    run a tool with real side effects (write/delete/move - see app/ai/graph.py
    on the backend) and needs the user's go-ahead first. Either way, the
    outcome lives in session_state so the next render can act on it."""
    if event["type"] == "needs_confirmation":
        st.session_state["pending_confirmation"] = event["confirmation"]
    else:
        st.session_state["pending_confirmation"] = None


def _stream_and_render(events) -> dict:
    """Drives st.write_stream with just the answer tokens as they arrive;
    tool-status updates ("🔧 Using search_knowledge_base...") show in a
    separate placeholder since they aren't part of the answer text itself.
    Returns the final event (done / needs_confirmation / error) once the
    backend's stream ends."""
    status_placeholder = st.empty()
    outcome: dict = {}

    def token_stream():
        try:
            for event in events:
                if event["type"] == "status":
                    if event["tool"] == "self-review":
                        # Missy caught an issue with her own draft and is
                        # fixing it - see app/ai/graph.py's critique step.
                        # Signaled explicitly so the corrected text doesn't
                        # look like it's silently overwriting the draft.
                        status_placeholder.caption("🔄 Refining answer...")
                    else:
                        status_placeholder.caption(f"🔧 Using {event['tool']}...")
                elif event["type"] == "token":
                    status_placeholder.empty()
                    yield event["text"]
                elif event["type"] in _FINAL_EVENT_TYPES:
                    outcome["event"] = event
        except api_client.ApiError as exc:
            outcome["event"] = {"type": "error", "detail": str(exc)}

    st.write_stream(token_stream())
    status_placeholder.empty()
    return outcome.get("event", {"type": "error", "detail": "No response received."})


def _send_and_show(token: str, conversation_id: str, provider: str, content: str, attached_file) -> bool:
    """Renders the user's turn, streams the reply live (or stores a pending
    confirmation for the next render). Returns True on success (caller
    should rerun to reset attachment widgets)."""
    image_file = attached_file if attached_file and _is_image(attached_file.name) else None
    document_file = attached_file if attached_file and not image_file else None

    with st.chat_message("user"):
        st.markdown(content)
        if image_file is not None:
            st.image(image_file.getvalue(), width=200)
        if document_file is not None:
            st.caption(f"📄 {document_file.name}")

    image_arg = (image_file.name, image_file.getvalue(), image_file.type) if image_file else None
    document_arg = (document_file.name, document_file.getvalue()) if document_file else None
    events = api_client.stream_message(token, conversation_id, content, provider, image=image_arg, document=document_arg)

    with st.chat_message("assistant"):
        outcome = _stream_and_render(events)
        if outcome["type"] == "error":
            st.error(outcome["detail"])
            return False

    _store_final_event(outcome)
    return True


def _render_pending_confirmation(token: str, conversation_id: str, confirmation: dict) -> None:
    with st.chat_message("assistant"):
        st.warning(f"⚠️ Missy wants to run **{confirmation['tool_name']}** with these arguments:")
        st.json(confirmation["tool_args"])
        approve_col, deny_col = st.columns(2)
        if approve_col.button("✅ Approve", key=f"approve_{confirmation['id']}", use_container_width=True):
            _resolve_confirmation(token, conversation_id, confirmation["id"], True)
        if deny_col.button("❌ Deny", key=f"deny_{confirmation['id']}", use_container_width=True):
            _resolve_confirmation(token, conversation_id, confirmation["id"], False)


def _resolve_confirmation(token: str, conversation_id: str, confirmation_id: str, approved: bool) -> None:
    with st.spinner("Approving..." if approved else "Denying..."):
        events = api_client.stream_confirm_tool_call(token, conversation_id, confirmation_id, approved)
        outcome = {"type": "error", "detail": "No response received."}
        try:
            for event in events:
                if event["type"] in _FINAL_EVENT_TYPES:
                    outcome = event
        except api_client.ApiError as exc:
            outcome = {"type": "error", "detail": str(exc)}

    if outcome["type"] == "error":
        st.error(outcome["detail"])
        return
    _store_final_event(outcome)
    st.rerun()


def render() -> None:
    token = session.get_token()
    st.title(f"Chat with {st.session_state.get('assistant_name', 'Missy')}")

    try:
        all_providers = api_client.list_providers(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    providers = [p for p in all_providers if not p["is_revoked"]]

    if not all_providers:
        st.info("No LLM provider connected yet - head to **API Connections** to add one before chatting.")
        return
    if not providers:
        st.info("All your connections are revoked - head to **API Connections** to unrevoke one or add a new one.")
        return

    labels = [
        f"{p['name'] or _PROVIDER_LABELS.get(p['provider'], p['provider'])} · {p['model_name']}" for p in providers
    ]
    default_index = next((i for i, p in enumerate(providers) if p["is_active"]), 0)

    _, picker_col = st.columns([2, 1])
    with picker_col:
        selected_index = st.selectbox(
            "Answering with",
            options=range(len(providers)),
            format_func=lambda i: labels[i],
            index=default_index,
            label_visibility="collapsed",
        )
    selected_provider = providers[selected_index]["provider"]

    try:
        conversation = _get_primary_conversation(token)
        messages = api_client.get_messages(token, conversation["id"])
        # The backend is the source of truth for a pending confirmation, not
        # just session_state - a still-paused turn needs to reappear even
        # after a page reload wipes client-side state.
        st.session_state["pending_confirmation"] = api_client.get_pending_confirmation(token, conversation["id"])
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    response_language = st.session_state.get("response_language") or "English"

    for message in messages:
        role = "user" if message["role"] == "user" else "assistant"
        with st.chat_message(role):
            st.markdown(message["content"])
            if role == "assistant":
                listen_col, download_col, _ = st.columns([1, 1, 8])
                if listen_col.button("🔊", key=f"listen_{message['id']}", help="Listen to this reply"):
                    try:
                        audio_bytes = api_client.synthesize_speech(token, message["content"], response_language)
                        st.audio(audio_bytes, format="audio/mp3", autoplay=True)
                    except api_client.ApiError as exc:
                        st.error(str(exc))
                download_col.download_button(
                    "⬇️",
                    data=message["content"],
                    file_name=f"missy-reply-{message['id'][:8]}.md",
                    key=f"download_{message['id']}",
                    help="Download this reply as a markdown file",
                )

    pending_confirmation = st.session_state.get("pending_confirmation")
    if pending_confirmation:
        _render_pending_confirmation(token, conversation["id"], pending_confirmation)
        return  # no new message until this one's resolved - it's the same paused turn

    version = st.session_state.get("attach_version", 0)

    # Compact icon row - a file/mic picker only appears once you click it,
    # instead of two full-height drag-and-drop boxes sitting open by default.
    attach_col, mic_col, _ = st.columns([1, 1, 10])
    with attach_col:
        with st.popover("📎", help="Attach an image or document"):
            attached_file = st.file_uploader(
                "Attach a file",
                type=sorted(_IMAGE_EXTS | _DOCUMENT_EXTS),
                key=f"attach_upl_{version}",
                label_visibility="collapsed",
            )
            st.caption("Images need a vision-capable model (GPT-4o, Claude, or Gemini).")
    with mic_col:
        with st.popover("🎤", help="Record a voice message"):
            audio_file = st.audio_input("Record", key=f"audio_upl_{version}", label_visibility="collapsed")

    if attached_file is not None:
        chip_col, remove_col, _ = st.columns([2, 1, 9])
        with chip_col:
            if _is_image(attached_file.name):
                st.image(attached_file.getvalue(), width=60)
            else:
                st.caption(f"📄 {attached_file.name}")
        with remove_col:
            if st.button("✕", key=f"remove_attach_{version}", help="Remove attachment"):
                _bump_attachment_version()
                st.rerun()

    if audio_file is not None:
        with st.spinner("Transcribing..."):
            try:
                transcribed = api_client.transcribe_audio(token, "voice.wav", audio_file.getvalue())
            except api_client.ApiError as exc:
                st.error(str(exc))
                _bump_attachment_version()
                st.rerun()
        if transcribed.strip():
            if _send_and_show(token, conversation["id"], selected_provider, transcribed, None):
                _bump_attachment_version()
                st.rerun()
        else:
            st.warning("Didn't catch any speech in that recording - try again.")
            _bump_attachment_version()
            st.rerun()

    user_input = st.chat_input("Message Missy...")
    if user_input:
        if _send_and_show(token, conversation["id"], selected_provider, user_input, attached_file):
            _bump_attachment_version()
            st.rerun()
