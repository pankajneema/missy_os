import streamlit as st

import api_client
import session

_CUSTOM_OPTION = "Custom / other..."

# Curated defaults per provider - "Custom / other..." always lets you type an
# exact model id if a newer one isn't in this list yet.
_PROVIDERS = [
    ("openai", "OpenAI", ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"]),
    ("anthropic", "Anthropic (Claude)", ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"]),
    ("gemini", "Google (Gemini)", ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"]),
    ("groq", "Groq", ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"]),
]


def _model_select_index(options: list[str], current_model: str | None) -> int:
    if current_model and current_model in options:
        return options.index(current_model)
    return len(options) - 1 if current_model else 0  # unrecognized saved model -> land on "Custom"


def _render_provider_tab(token: str, provider_key: str, label: str, model_options: list[str], existing: dict | None) -> None:
    if existing:
        st.caption(f"Configured · key `{existing['masked_api_key']}` · model `{existing['model_name']}`")
    else:
        st.caption("Not configured yet.")

    options = [*model_options, _CUSTOM_OPTION]
    current_model = existing["model_name"] if existing else None

    # Deliberately NOT an st.form: the "Custom / other..." branch below has to
    # react to the selectbox immediately. Inside a form, widget changes only
    # take effect on submit - so picking "Custom" and hitting Save in the same
    # click would save whatever was left in the (not-yet-rendered) text box,
    # not what the user actually typed.
    api_key = st.text_input("API key", type="password", key=f"key_{provider_key}")
    model_choice = st.selectbox(
        "Model", options, index=_model_select_index(model_options, current_model), key=f"model_choice_{provider_key}"
    )
    custom_model = ""
    if model_choice == _CUSTOM_OPTION:
        custom_model = st.text_input(
            "Exact model id",
            value=current_model if current_model and current_model not in model_options else "",
            placeholder="e.g. gemini-2.5-flash",
            key=f"custom_{provider_key}",
        )

    if st.button("Save", key=f"save_btn_{provider_key}", use_container_width=True):
        model_name = custom_model.strip() if model_choice == _CUSTOM_OPTION else model_choice
        if not api_key or not model_name:
            st.error("Both API key and model are required.")
        else:
            try:
                api_client.save_provider(token, provider_key, api_key, model_name)
                st.success(f"{label} saved.")
                st.rerun()
            except api_client.ApiError as exc:
                st.error(str(exc))

    if existing:
        confirm_key = f"confirm_delete_{provider_key}"
        if st.button("Delete", key=f"delete_btn_{provider_key}"):
            st.session_state[confirm_key] = True

        if st.session_state.get(confirm_key):
            st.warning(f"Remove your saved {label} key? You'll need to re-enter it to use {label} again.")
            confirm_col, cancel_col = st.columns(2)
            if confirm_col.button("Yes, delete", key=f"confirm_yes_{provider_key}", use_container_width=True):
                try:
                    api_client.delete_provider(token, provider_key)
                except api_client.ApiError as exc:
                    st.error(str(exc))
                else:
                    st.session_state[confirm_key] = False
                    st.rerun()
            if cancel_col.button("Cancel", key=f"confirm_no_{provider_key}", use_container_width=True):
                st.session_state[confirm_key] = False
                st.rerun()


def render() -> None:
    token = session.get_token()
    st.title("Settings")
    st.caption("Add a provider here, then pick which model answers each message from the Chat page.")

    try:
        providers_by_key = {p["provider"]: p for p in api_client.list_providers(token)}
    except api_client.ApiError as exc:
        st.error(str(exc))
        return

    tabs = st.tabs([label for _, label, _ in _PROVIDERS])
    for tab, (provider_key, label, model_options) in zip(tabs, _PROVIDERS):
        with tab:
            _render_provider_tab(token, provider_key, label, model_options, providers_by_key.get(provider_key))
