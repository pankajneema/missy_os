import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from app.ai.knowledge_graph_extraction import extract_graph_data
from app.ai.tools import build_tools
from app.core.encryption import encrypt_secret
from app.models.llm_credential import LLMProvider
from app.models.user import User
from app.repositories import credential_repo, knowledge_graph_repo
from app.services import knowledge_service

pytestmark = pytest.mark.anyio


def test_get_or_create_entity_deduplicates_case_insensitively(db, user: User):
    first = knowledge_graph_repo.get_or_create_entity(db, user.id, "PostgreSQL", "technology", None)
    second = knowledge_graph_repo.get_or_create_entity(db, user.id, "postgresql", "technology", None)

    assert first.id == second.id


def test_get_or_create_entity_creates_distinct_entities_for_distinct_names(db, user: User):
    first = knowledge_graph_repo.get_or_create_entity(db, user.id, "PostgreSQL", "technology", None)
    second = knowledge_graph_repo.get_or_create_entity(db, user.id, "ClickHouse", "technology", None)

    assert first.id != second.id


def test_get_relationships_for_entity_finds_edges_in_both_directions(db, user: User):
    minio = knowledge_graph_repo.get_or_create_entity(db, user.id, "MinIO", "technology", None)
    storage = knowledge_graph_repo.get_or_create_entity(db, user.id, "object storage", "concept", None)
    source = knowledge_service.add_note(db, user.id, "notes", "MinIO is used for object storage.")

    knowledge_graph_repo.create_relationship(db, user.id, minio.id, storage.id, "used for", "S3-compatible", source.id)

    assert len(knowledge_graph_repo.get_relationships_for_entity(db, user.id, minio.id)) == 1
    assert len(knowledge_graph_repo.get_relationships_for_entity(db, user.id, storage.id)) == 1


def test_extract_graph_data_parses_a_valid_response():
    response_json = (
        '[{"source": "MinIO", "relationship": "used for", "target": "object storage", '
        '"source_type": "technology", "target_type": "concept", "description": "S3-compatible"}]'
    )
    model = GenericFakeChatModel(messages=iter([AIMessage(content=response_json)]))

    items = extract_graph_data(model, "MinIO is used for object storage because it is S3-compatible.")

    assert len(items) == 1
    assert items[0]["source"] == "MinIO"
    assert items[0]["target"] == "object storage"


def test_extract_graph_data_yields_nothing_on_malformed_response():
    model = GenericFakeChatModel(messages=iter([AIMessage(content="not json at all")]))

    assert extract_graph_data(model, "some text") == []


async def test_ingestion_populates_the_graph_when_a_credential_is_available(db, user: User, monkeypatch):
    credential_repo.upsert(db, user.id, LLMProvider.groq, encrypt_secret("fake-key"), "llama-3.3-70b-versatile", None)
    response_json = (
        '[{"source": "MinIO", "relationship": "used for", "target": "object storage", '
        '"source_type": "technology", "target_type": "concept", "description": "S3-compatible"}]'
    )
    fake_model = GenericFakeChatModel(messages=iter([AIMessage(content=response_json)]))
    monkeypatch.setattr("app.services.knowledge_service.build_chat_model", lambda *a, **k: fake_model)

    knowledge_service.add_note(db, user.id, "notes", "MinIO is used for object storage because it is S3-compatible.")

    minio = knowledge_graph_repo.find_entity_by_name(db, user.id, "MinIO")
    assert minio is not None
    relationships = knowledge_graph_repo.get_relationships_for_entity(db, user.id, minio.id)
    assert len(relationships) == 1
    assert relationships[0].relationship_type == "used for"


def test_ingestion_skips_graph_extraction_without_a_credential(db, user: User):
    # No credential configured for this user - extraction is best-effort and
    # must not raise or block ingestion, it should just do nothing.
    knowledge_service.add_note(db, user.id, "notes", "MinIO is used for object storage.")

    assert knowledge_graph_repo.find_entity_by_name(db, user.id, "MinIO") is None


def test_search_knowledge_graph_tool_finds_relationships(db, user: User):
    minio = knowledge_graph_repo.get_or_create_entity(db, user.id, "MinIO", "technology", None)
    storage = knowledge_graph_repo.get_or_create_entity(db, user.id, "object storage", "concept", None)
    source = knowledge_service.add_note(db, user.id, "notes", "MinIO is used for object storage.")
    knowledge_graph_repo.create_relationship(db, user.id, minio.id, storage.id, "used for", "S3-compatible", source.id)

    tools = build_tools(db, user.id)
    graph_tool = next(t for t in tools if t.name == "search_knowledge_graph")

    result = graph_tool.invoke({"entity_name": "MinIO"})

    assert "MinIO" in result
    assert "used for" in result
    assert "object storage" in result


def test_search_knowledge_graph_tool_reports_no_match_cleanly(db, user: User):
    tools = build_tools(db, user.id)
    graph_tool = next(t for t in tools if t.name == "search_knowledge_graph")

    result = graph_tool.invoke({"entity_name": "NonexistentThing"})

    assert "No entity matching" in result
