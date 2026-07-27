import streamlit as st

import api_client
import session

_PROVIDER_LABELS = {"openai": "OpenAI", "anthropic": "Anthropic", "gemini": "Gemini", "groq": "Groq"}


def _get_primary_conversation(token: str) -> dict:
    """Missy is one assistant, not a set of separate chat threads - every
    user gets exactly one persistent conversation. If more than one exists
    (e.g. from earlier testing), we stick to the oldest for continuity."""
    conversations = api_client.list_conversations(token)
    if not conversations:
        return api_client.create_conversation(token)
    return min(conversations, key=lambda c: c["created_at"])


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
        conversation = _get_primary_conversation(token)
        messages = api_client.get_messages(token, conversation["id"])
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    for message in messages:
        with st.chat_message("user" if message["role"] == "user" else "assistant"):
            st.markdown(message["content"])

    user_input = st.chat_input("Message Missy...")
    if user_input:
        with st.chat_message("user"):
            st.markdown(user_input)
        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                try:
                    reply = api_client.send_message(token, conversation["id"], user_input, selected_provider)
                    st.markdown(reply["content"])
                except api_client.ApiError as exc:
                    st.error(str(exc))
                    return
        st.rerun()
