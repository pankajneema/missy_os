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

_TONES = ["No preference", "Direct and concise", "Warm and encouraging", "Formal and precise"]


def render() -> None:
    token = session.get_token()
    st.title("Settings")
    st.caption(
        "The assistant configuration you set up when you first signed in - change her name, personality, "
        "tone, or reply language any time. Response language also controls voice output (🔊 Listen), since "
        "that's the only sound setting there currently is to configure."
    )

    try:
        profile = api_client.get_profile(token)
    except api_client.ApiError as exc:
        st.error(str(exc))
        profile = None

    current_language = profile["response_language"] if profile else "English"
    current_tone = profile["tone_preference"] if profile else None

    # Language picker lives outside the form: selecting "Other" has to reveal
    # a text box immediately, and widgets inside st.form only take effect on
    # submit - the same trap that broke the "Custom model" field elsewhere.
    language_index = _LANGUAGES.index(current_language) if current_language in _LANGUAGES else len(_LANGUAGES) - 1
    language_choice = st.selectbox("Reply in which language?", _LANGUAGES, index=language_index)
    custom_language = ""
    if language_choice == "Other":
        custom_language = st.text_input(
            "Which language?",
            value=current_language if current_language not in _LANGUAGES else "",
            placeholder="e.g. Bhojpuri, French, ...",
        )

    with st.form("assistant_config_form"):
        assistant_name = st.text_input(
            "What should your assistant be called?", value=profile["assistant_name"] if profile else "Missy"
        )
        user_about_me = st.text_area(
            "Tell your assistant about yourself",
            value=profile["user_about_me"] if profile else "",
            height=120,
        )
        persona_description = st.text_area(
            "What kind of assistant do you want?",
            value=profile["persona_description"] if profile else "",
            height=120,
        )
        tone_index = _TONES.index(current_tone) if current_tone in _TONES else 0
        tone_preference = st.selectbox("Preferred tone (optional)", _TONES, index=tone_index)
        submitted = st.form_submit_button("Save", use_container_width=True)

    if submitted:
        if not user_about_me.strip() or not persona_description.strip():
            st.error("Tell Missy a bit about yourself and what you want from her before saving.")
            return

        response_language = custom_language.strip() if language_choice == "Other" else language_choice
        if not response_language:
            st.error("Enter the language you want responses in.")
            return

        tone = None if tone_preference == "No preference" else tone_preference
        final_assistant_name = assistant_name.strip() or "Missy"
        try:
            api_client.save_profile(
                token,
                assistant_name=final_assistant_name,
                persona_description=persona_description,
                user_about_me=user_about_me,
                tone_preference=tone,
                response_language=response_language,
            )
            st.session_state["assistant_name"] = final_assistant_name
            st.session_state["response_language"] = response_language
            st.success("Saved.")
            st.rerun()
        except api_client.ApiError as exc:
            st.error(str(exc))
