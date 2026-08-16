import os

from app.core import tracing


def test_configure_tracing_is_a_noop_without_an_api_key(monkeypatch):
    class _Settings:
        langsmith_api_key = None
        langsmith_project = "missy-os"

    monkeypatch.setattr(tracing, "get_settings", lambda: _Settings())
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)

    tracing.configure_tracing()

    assert "LANGSMITH_TRACING" not in os.environ


def test_configure_tracing_bridges_settings_into_the_environ_when_key_is_set(monkeypatch):
    class _Settings:
        langsmith_api_key = "lsv2_fake_test_key"
        langsmith_project = "my-project"

    monkeypatch.setattr(tracing, "get_settings", lambda: _Settings())
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)

    tracing.configure_tracing()

    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_API_KEY"] == "lsv2_fake_test_key"
    assert os.environ["LANGSMITH_PROJECT"] == "my-project"
