from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from app.core.encryption import encrypt_secret
from app.models.llm_credential import LLMProvider
from app.models.user import User
from app.repositories import credential_repo
from app.services import knowledge_service


def test_search_finds_a_relevant_ingested_note(db, user: User):
    knowledge_service.add_note(
        db, user.id, "Vacation policy", "Employees get 20 days of paid vacation per year, accrued monthly."
    )
    knowledge_service.add_note(
        db, user.id, "Parking", "Visitor parking is available in garage B, level 2."
    )

    results = knowledge_service.search(db, user.id, "how many vacation days do employees get")

    assert results
    assert any("vacation" in chunk.content.lower() for chunk in results)


def test_search_returns_nothing_for_a_user_with_no_sources(db, user: User):
    assert knowledge_service.search(db, user.id, "anything at all") == []


def test_add_file_describes_an_image_and_makes_it_searchable(db, user: User, monkeypatch):
    credential_repo.upsert(db, user.id, LLMProvider.groq, encrypt_secret("fake-key"), "llama-3.3-70b-versatile", None)
    fake_model = GenericFakeChatModel(
        messages=iter([AIMessage(content="A whiteboard photo showing the text 'Q3 ROADMAP' in blue marker.")])
    )
    monkeypatch.setattr("app.services.knowledge_service.build_chat_model", lambda *a, **k: fake_model)

    source = knowledge_service.add_file(db, user.id, "whiteboard.png", b"fake-image-bytes")

    assert source.status == "ready"
    results = knowledge_service.search(db, user.id, "Q3 roadmap whiteboard")
    assert any("Q3 ROADMAP" in chunk.content for chunk in results)


def test_add_file_marks_image_failed_without_a_credential(db, user: User):
    source = knowledge_service.add_file(db, user.id, "whiteboard.png", b"fake-image-bytes")

    assert source.status == "failed"
    assert "API connection" in source.error_message


def test_add_file_marks_image_failed_when_the_model_call_raises(db, user: User, monkeypatch):
    credential_repo.upsert(db, user.id, LLMProvider.groq, encrypt_secret("fake-key"), "llama-3.3-70b-versatile", None)

    class _ExplodingModel:
        def invoke(self, _messages):
            raise RuntimeError("model does not support images")

    monkeypatch.setattr("app.services.knowledge_service.build_chat_model", lambda *a, **k: _ExplodingModel())

    source = knowledge_service.add_file(db, user.id, "whiteboard.png", b"fake-image-bytes")

    assert source.status == "failed"
    assert "does not support images" in source.error_message
