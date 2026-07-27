import streamlit as st


def init_session_state() -> None:
    st.session_state.setdefault("access_token", None)
    st.session_state.setdefault("username", None)
    st.session_state.setdefault("has_profile", False)
    st.session_state.setdefault("active_conversation_id", None)


def is_authenticated() -> bool:
    return st.session_state.get("access_token") is not None


def login(access_token: str, username: str, has_profile: bool) -> None:
    st.session_state["access_token"] = access_token
    st.session_state["username"] = username
    st.session_state["has_profile"] = has_profile


def logout() -> None:
    st.session_state["access_token"] = None
    st.session_state["username"] = None
    st.session_state["has_profile"] = False
    st.session_state["active_conversation_id"] = None


def get_token() -> str | None:
    return st.session_state.get("access_token")
