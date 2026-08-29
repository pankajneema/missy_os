from app.models.llm_credential import LLMProvider
from app.services import provider_service


def test_test_connection_masks_the_api_key_if_a_provider_echoes_it_back(monkeypatch):
    class _ExplodingModel:
        def invoke(self, *a, **k):
            raise RuntimeError("invalid api key: sk-super-secret-12345")

    monkeypatch.setattr("app.services.provider_service.build_chat_model", lambda *a, **k: _ExplodingModel())

    success, message = provider_service.test_connection(LLMProvider.openai, "sk-super-secret-12345", "gpt-4o")

    assert success is False
    assert "sk-super-secret-12345" not in message
    assert message.endswith("2345")  # mask_secret keeps the last 4 characters visible


def test_test_connection_reports_success(monkeypatch):
    class _FakeModel:
        def invoke(self, *a, **k):
            return "OK"

    monkeypatch.setattr("app.services.provider_service.build_chat_model", lambda *a, **k: _FakeModel())

    success, message = provider_service.test_connection(LLMProvider.openai, "sk-real-key", "gpt-4o")

    assert success is True
    assert message == "Connection verified."
