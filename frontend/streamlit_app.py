import streamlit as st

import session
from views import auth_view, chat_view, knowledge_view, onboarding_view, settings_view

st.set_page_config(page_title="Missy", page_icon="🤖", layout="centered")
session.init_session_state()

if not session.is_authenticated():
    auth_view.render()
elif not st.session_state.get("has_profile"):
    onboarding_view.render()
else:
    with st.sidebar:
        with st.container(border=True):
            st.markdown("**🤖 Missy**")
            st.caption(f"Signed in as {st.session_state['username']}")

        page = st.radio(
            "Navigate", ["💬  Chat", "📚  Knowledge Base", "⚙️  Settings"], label_visibility="collapsed"
        )

        st.divider()
        if st.button("Log out", use_container_width=True):
            session.logout()
            st.rerun()

    if "Chat" in page:
        chat_view.render()
    elif "Knowledge" in page:
        knowledge_view.render()
    else:
        settings_view.render()
