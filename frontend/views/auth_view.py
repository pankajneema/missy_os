import streamlit as st

import api_client
import session


def render() -> None:
    st.title("Missy")
    st.caption("Your personal AI operating system")

    login_tab, register_tab = st.tabs(["Log in", "Register"])

    with login_tab:
        with st.form("login_form"):
            username = st.text_input("Username")
            password = st.text_input("Password", type="password")
            submitted = st.form_submit_button("Log in", use_container_width=True)

        if submitted:
            if not username or not password:
                st.error("Enter both username and password.")
            else:
                try:
                    token_data = api_client.login(username, password)
                    _complete_login(token_data["access_token"])
                except api_client.ApiError as exc:
                    st.error(str(exc))

    with register_tab:
        with st.form("register_form"):
            new_username = st.text_input("Choose a username", key="reg_username")
            new_password = st.text_input("Choose a password", type="password", key="reg_password")
            confirm_password = st.text_input("Confirm password", type="password", key="reg_confirm")
            submitted = st.form_submit_button("Create account", use_container_width=True)

        if submitted:
            if not new_username or not new_password:
                st.error("Enter both a username and password.")
            elif new_password != confirm_password:
                st.error("Passwords don't match.")
            elif len(new_password) < 8:
                st.error("Password must be at least 8 characters.")
            else:
                try:
                    token_data = api_client.register(new_username, new_password)
                    _complete_login(token_data["access_token"])
                except api_client.ApiError as exc:
                    st.error(str(exc))


def _complete_login(access_token: str) -> None:
    me = api_client.get_me(access_token)
    session.login(access_token, me["username"], me["has_profile"])

    if me["has_profile"]:
        profile = api_client.get_profile(access_token)
        if profile:
            st.session_state["assistant_name"] = profile["assistant_name"]
            st.session_state["response_language"] = profile["response_language"]

    st.rerun()
