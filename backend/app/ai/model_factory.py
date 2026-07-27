from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from app.models.llm_credential import LLMProvider

# Maps our internal provider names to LangChain's model_provider identifiers.
_MODEL_PROVIDER_MAP = {
    LLMProvider.openai: "openai",
    LLMProvider.anthropic: "anthropic",
    LLMProvider.gemini: "google_genai",
    LLMProvider.groq: "groq",
}


def build_chat_model(provider: LLMProvider, model_name: str, api_key: str) -> BaseChatModel:
    """Provider-agnostic chat model loader.

    This is the one place the app ever branches on "which LLM provider" -
    every chain built on top of this (chat, and later RAG/agents) is
    provider-agnostic by construction.
    """
    model_provider = _MODEL_PROVIDER_MAP[provider]
    return init_chat_model(model_name, model_provider=model_provider, api_key=api_key)
