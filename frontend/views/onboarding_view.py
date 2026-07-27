import streamlit as st

import api_client
import session


def render() -> None:
    st.title("Let's set Missy up")
    st.caption("This is a one-time setup - it shapes how your assistant talks to you from now on.")

    with st.form("onboarding_form"):
        assistant_name = st.text_input("What should your assistant be called?", value="Missy")
        user_about_me = st.text_area(
            "Tell your assistant about yourself",
            placeholder="e.g. I'm a backend engineer, working solo on a side project. I prefer direct, technical answers.",
            height=120,
        )
        persona_description = st.text_area(
            "What kind of assistant do you want?",
            placeholder="e.g. Act like a sharp technical co-founder - push back on bad ideas, keep answers concise, "
            "help me think through architecture and code.",
            height=120,
        )
        tone_preference = st.selectbox(
            "Preferred tone (optional)",
            ["No preference", "Direct and concise", "Warm and encouraging", "Formal and precise"],
        )
        submitted = st.form_submit_button("Finish setup", use_container_width=True)

    if submitted:
        if not user_about_me.strip() or not persona_description.strip():
            st.error("Tell Missy a bit about yourself and what you want from her before continuing.")
            return

        tone = None if tone_preference == "No preference" else tone_preference
        try:
            api_client.save_profile(
                session.get_token(),
                assistant_name=assistant_name or "Missy",
                persona_description=persona_description,
                user_about_me=user_about_me,
                tone_preference=tone,
            )
            st.session_state["has_profile"] = True
            st.rerun()
        except api_client.ApiError as exc:
            st.error(str(exc))
