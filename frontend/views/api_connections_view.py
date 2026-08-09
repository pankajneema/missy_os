import streamlit as st

import api_client
import session

_CUSTOM_OPTION = "Custom / other..."

# (provider_key, display label, icon, model presets, where to get a key, help text)
_PROVIDERS = [
    (
        "openai",
        "OpenAI",
        "🟢",
        ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
        "https://platform.openai.com/api-keys",
        "A standard API key, starts with `sk-...`.",
    ),
    (
        "anthropic",
        "Anthropic (Claude)",
        "🟠",
        ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
        "https://console.anthropic.com/settings/keys",
        "A **Developer Console** API key, starts with `sk-ant-api03-...`. "
        "A Claude.ai login or an OAuth/`claude setup-token` credential is a different thing and won't work here.",
    ),
    (
        "gemini",
        "Google (Gemini)",
        "🔵",
        ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
        "https://aistudio.google.com/apikey",
        "Free API key from Google AI Studio.",
    ),
    (
        "groq",
        "Groq",
        "🟣",
        ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
        "https://console.groq.com/keys",
        "Free API key - also powers voice transcription (STT).",
    ),
]
_PROVIDER_META = {key: (label, icon, models, url, help_text) for key, label, icon, models, url, help_text in _PROVIDERS}


def _model_select_index(options: list[str], current_model: str | None) -> int:
    if current_model and current_model in options:
        return options.index(current_model)
    return len(options) - 1 if current_model else 0


def _render_add_form(token: str) -> None:
    with st.expander("➕ Add a connection", expanded=False):
        provider_key = st.selectbox(
            "Provider",
            [key for key, *_ in _PROVIDERS],
            format_func=lambda key: f"{_PROVIDER_META[key][1]} {_PROVIDER_META[key][0]}",
            key="new_conn_provider",
        )
        label, icon, model_options, key_url, key_help = _PROVIDER_META[provider_key]
        st.caption(f"[Get your API key]({key_url}) · {key_help}")

        name = st.text_input("Name (optional label, e.g. \"Personal\" or \"Work\")", key="new_conn_name")
        api_key = st.text_input("API key", type="password", key="new_conn_key")

        options = [*model_options, _CUSTOM_OPTION]
        model_choice = st.selectbox("Model", options, key="new_conn_model_choice")
        custom_model = ""
        if model_choice == _CUSTOM_OPTION:
            custom_model = st.text_input("Exact model id", placeholder="e.g. gemini-2.5-flash", key="new_conn_custom_model")

        if st.button("Save", key="new_conn_save", use_container_width=True):
            model_name = custom_model.strip() if model_choice == _CUSTOM_OPTION else model_choice
            if not api_key or not model_name:
                st.error("Both API key and model are required.")
                return
            with st.spinner("Verifying connection..."):
                try:
                    result = api_client.test_provider(token, provider_key, api_key, model_name)
                except api_client.ApiError as exc:
                    st.error(f"Couldn't verify: {exc}")
                    return
            if not result["success"]:
                st.error(f"❌ That didn't work: {result['message']}")
                return
            try:
                api_client.save_provider(token, provider_key, api_key, model_name, name.strip() or None)
                st.success("✅ Verified and saved.")
                st.rerun()
            except api_client.ApiError as exc:
                st.error(str(exc))


def _render_connection_row(token: str, credential: dict) -> None:
    provider_key = credential["provider"]
    label, icon, *_ = _PROVIDER_META.get(provider_key, ("Unknown", "⚪", [], "", ""))
    display_name = credential["name"] or label

    with st.container(border=True):
        name_col, status_col = st.columns([5, 2])
        name_col.markdown(f"**{icon} {display_name}**")
        name_col.caption(f"{label} · added via API Connections")
        if credential["is_revoked"]:
            status_col.markdown("🔴 **Revoked**")
        else:
            status_col.markdown("🟢 Active")

        key_col, model_col = st.columns([2, 2])
        with key_col:
            st.caption("API key")
            st.code(credential["masked_api_key"], language=None)
        with model_col:
            st.caption("Model")
            st.code(credential["model_name"], language=None)

        revoke_col, delete_col = st.columns(2)
        if credential["is_revoked"]:
            if revoke_col.button("Unrevoke", key=f"unrevoke_{provider_key}", use_container_width=True):
                try:
                    api_client.set_provider_revoked(token, provider_key, False)
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))
        else:
            if revoke_col.button("Revoke", key=f"revoke_{provider_key}", use_container_width=True):
                try:
                    api_client.set_provider_revoked(token, provider_key, True)
                    st.rerun()
                except api_client.ApiError as exc:
                    st.error(str(exc))

        if delete_col.button("Delete", key=f"delete_{provider_key}", use_container_width=True):
            st.session_state[f"confirm_delete_conn_{provider_key}"] = True

        confirm_key = f"confirm_delete_conn_{provider_key}"
        if st.session_state.get(confirm_key):
            st.warning(f"Permanently delete this {label} connection?")
            yes_col, no_col = st.columns(2)
            if yes_col.button("Yes, delete", key=f"confirm_yes_conn_{provider_key}", use_container_width=True):
                try:
                    api_client.delete_provider(token, provider_key)
                except api_client.ApiError as exc:
                    st.error(str(exc))
                else:
                    st.session_state[confirm_key] = False
                    st.rerun()
            if no_col.button("Cancel", key=f"confirm_no_conn_{provider_key}", use_container_width=True):
                st.session_state[confirm_key] = False
                st.rerun()


def render() -> None:
    token = session.get_token()
    st.title("API Connections")
    st.caption("Every LLM credential you've connected - revoke one to stop Missy using it without deleting it, or delete it entirely.")

    _render_add_form(token)

    st.divider()

    try:
        connections = api_client.list_providers(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    if not connections:
        st.info("Nothing connected yet - use \"Add a connection\" above.")
        return

    for credential in connections:
        _render_connection_row(token, credential)
