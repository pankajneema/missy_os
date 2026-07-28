from app.models.assistant_profile import AssistantProfile
from app.models.knowledge_chunk import KnowledgeChunk


def build_system_prompt(profile: AssistantProfile) -> str:
    tone_line = f"\nPreferred tone: {profile.tone_preference}." if profile.tone_preference else ""
    return (
        f"You are {profile.assistant_name}, a personal AI assistant.\n"
        f"About the user you are helping: {profile.user_about_me}\n"
        f"How you should behave and what you're expected to help with: {profile.persona_description}"
        f"{tone_line}\n"
        f"Always respond in {profile.response_language}, regardless of what language the user writes in, "
        "unless they explicitly ask you to switch languages.\n"
        "Be direct, helpful, and stay in character as the assistant described above."
    )


def build_knowledge_context(chunks: list[KnowledgeChunk]) -> str:
    """Formats retrieved chunks as a cited context block - naive RAG, no
    reranking or query rewriting (that's Advanced RAG, a later pass)."""
    if not chunks:
        return ""
    excerpts = "\n\n".join(f'[Source: "{chunk.source.title}"]\n{chunk.content}' for chunk in chunks)
    return (
        "Here are excerpts from the user's knowledge base that may be relevant. "
        "Use them if they help answer the question, and mention which source you drew from. "
        "If they aren't relevant, ignore them and answer normally.\n\n"
        f"{excerpts}"
    )


def build_human_content(text: str, image_data_url: str | None) -> str | list[dict]:
    """Plain string for a text-only turn; a multimodal content-block list when
    an image is attached. Only the current turn ever carries the image bytes -
    history is replayed as plain text so older attachments don't get resent
    (and re-billed) on every subsequent message."""
    if image_data_url is None:
        return text
    return [
        {"type": "text", "text": text},
        {"type": "image_url", "image_url": {"url": image_data_url}},
    ]
