import streamlit as st

import api_client
import session

_PROVIDER_LABELS = {"openai": "OpenAI", "anthropic": "Anthropic", "gemini": "Gemini", "groq": "Groq"}
_IMAGE_EXTS = {"png", "jpg", "jpeg", "webp"}
_DOCUMENT_EXTS = {"pdf", "docx", "txt", "md"}


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


def _send_and_show(
    token: str, conversation_id: str, provider: str, content: str, attached_file, use_knowledge_base: bool
) -> bool:
    """Renders the user's turn, calls the backend, renders the reply. Returns
    True on success (caller should rerun to reset attachment widgets)."""
    image_file = attached_file if attached_file and _is_image(attached_file.name) else None
    document_file = attached_file if attached_file and not image_file else None

    with st.chat_message("user"):
        st.markdown(content)
        if image_file is not None:
            st.image(image_file.getvalue(), width=200)
        if document_file is not None:
            st.caption(f"📄 {document_file.name}")

    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            try:
                image_arg = (image_file.name, image_file.getvalue(), image_file.type) if image_file else None
                document_arg = (document_file.name, document_file.getvalue()) if document_file else None
                reply = api_client.send_message(
                    token,
                    conversation_id,
                    content,
                    provider,
                    image=image_arg,
                    document=document_arg,
                    use_knowledge_base=use_knowledge_base,
                )
                st.markdown(reply["content"])
            except api_client.ApiError as exc:
                st.error(str(exc))
                return False
    return True


def render() -> None:
    token = session.get_token()
    st.title(f"Chat with {st.session_state.get('assistant_name', 'Missy')}")

    try:
        providers = api_client.list_providers(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    if not providers:
        st.info("No LLM provider configured yet - head to **Settings** to add one before chatting.")
        return

    labels = [f"{_PROVIDER_LABELS.get(p['provider'], p['provider'])} · {p['model_name']}" for p in providers]
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
        knowledge_sources = api_client.list_knowledge_sources(token)
    except api_client.ApiError:
        knowledge_sources = []
    has_ready_knowledge = any(s["status"] == "ready" for s in knowledge_sources)
    use_knowledge_base = False
    if has_ready_knowledge:
        use_knowledge_base = st.checkbox("🔎 Search my knowledge base", key="use_kb_checkbox")

    try:
        conversation = _get_primary_conversation(token)
        messages = api_client.get_messages(token, conversation["id"])
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
            if _send_and_show(token, conversation["id"], selected_provider, transcribed, None, use_knowledge_base):
                _bump_attachment_version()
                st.rerun()
        else:
            st.warning("Didn't catch any speech in that recording - try again.")
            _bump_attachment_version()
            st.rerun()

    user_input = st.chat_input("Message Missy...")
    if user_input:
        if _send_and_show(
            token, conversation["id"], selected_provider, user_input, attached_file, use_knowledge_base
        ):
            _bump_attachment_version()
            st.rerun()
