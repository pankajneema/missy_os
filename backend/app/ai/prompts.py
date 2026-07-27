from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from app.models.assistant_profile import AssistantProfile

CHAT_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", "{system_prompt}"),
        MessagesPlaceholder("history"),
        ("human", "{input}"),
    ]
)


def build_system_prompt(profile: AssistantProfile) -> str:
    tone_line = f"\nPreferred tone: {profile.tone_preference}." if profile.tone_preference else ""
    return (
        f"You are {profile.assistant_name}, a personal AI assistant.\n"
        f"About the user you are helping: {profile.user_about_me}\n"
        f"How you should behave and what you're expected to help with: {profile.persona_description}"
        f"{tone_line}\n"
        "Be direct, helpful, and stay in character as the assistant described above."
    )
