import streamlit as st

import api_client
import session

_LANGUAGES = [
    "English",
    "Hindi",
    "Hinglish",
    "Marathi",
    "Telugu",
    "Tamil",
    "Bengali",
    "Gujarati",
    "Kannada",
    "Punjabi",
    "Malayalam",
    "Urdu",
    "Other",
]


def render() -> None:
    st.title("Let's set Missy up")
    st.caption("This is a one-time setup - it shapes how your assistant talks to you from now on.")

    # Language picker lives outside the form: selecting "Other" has to reveal
    # a text box immediately, and widgets inside st.form only take effect on
    # submit - the same trap that broke the Settings "Custom model" field.
    language_choice = st.selectbox("Reply in which language?", _LANGUAGES, index=0)
    custom_language = ""
    if language_choice == "Other":
        custom_language = st.text_input("Which language?", placeholder="e.g. Bhojpuri, French, ...")

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

        response_language = custom_language.strip() if language_choice == "Other" else language_choice
        if not response_language:
            st.error("Enter the language you want responses in.")
            return

        tone = None if tone_preference == "No preference" else tone_preference
        final_assistant_name = assistant_name.strip() or "Missy"
        try:
            api_client.save_profile(
                session.get_token(),
                assistant_name=final_assistant_name,
                persona_description=persona_description,
                user_about_me=user_about_me,
                tone_preference=tone,
                response_language=response_language,
            )
            st.session_state["has_profile"] = True
            st.session_state["assistant_name"] = final_assistant_name
            st.session_state["response_language"] = response_language
            st.rerun()
        except api_client.ApiError as exc:
            st.error(str(exc))
