from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from app.ai.embeddings import embed_text
from app.ai.memory_extraction import extract_consolidation_actions
from app.models.memory_entry import MemoryCategory, MemorySource
from app.models.user import User
from app.repositories import memory_repo
from app.services import memory_service
from app.services.memory_service import ConsolidationAction


def test_remembering_a_near_duplicate_fact_supersedes_instead_of_duplicating(db, user: User):
    memory_service.remember(db, user.id, "Works as a backend engineer", MemorySource.manual)
    memory_service.remember(db, user.id, "Works as a backend software engineer", MemorySource.manual)

    entries = memory_service.list_memories(db, user.id)

    assert len(entries) == 1
    assert entries[0].content == "Works as a backend software engineer"


def test_remembering_distinct_facts_creates_separate_entries(db, user: User):
    memory_service.remember(db, user.id, "Works as a backend engineer", MemorySource.manual)
    memory_service.remember(db, user.id, "Owns a golden retriever named Max", MemorySource.manual)

    entries = memory_service.list_memories(db, user.id)

    assert len(entries) == 2


def _insert_raw(db, user_id, content: str, category: MemoryCategory = MemoryCategory.fact):
    """Inserts a memory entry directly through the repo, bypassing
    remember()'s write-time supersede check - consolidation tests need
    near-duplicate rows to actually exist side by side first (the exact
    situation plan_consolidation is meant to clean up), which remember()
    would otherwise collapse into one before the test even starts."""
    return memory_repo.create(db, user_id, content, embed_text(content), MemorySource.manual, category)


def test_extract_consolidation_actions_parses_a_valid_response():
    response_json = (
        '[{"remove_ids": [1, 2], "replacement": {"content": "Works as a backend engineer", "category": "fact"}}]'
    )
    model = GenericFakeChatModel(messages=iter([AIMessage(content=response_json)]))

    actions = extract_consolidation_actions(
        model, [{"id": 1, "content": "Works as a backend engineer", "category": "fact"}]
    )

    assert len(actions) == 1
    assert actions[0]["remove_ids"] == [1, 2]


def test_extract_consolidation_actions_yields_nothing_on_malformed_response():
    model = GenericFakeChatModel(messages=iter([AIMessage(content="not json at all")]))

    assert extract_consolidation_actions(model, []) == []


def test_plan_consolidation_returns_nothing_with_fewer_than_two_entries(db, user: User):
    _insert_raw(db, user.id, "Owns a golden retriever named Max")
    model = GenericFakeChatModel(messages=iter([AIMessage(content="[]")]))

    assert memory_service.plan_consolidation(db, user.id, model) == []


def test_plan_consolidation_merges_a_duplicate_pair(db, user: User):
    _insert_raw(db, user.id, "Works as a backend engineer")
    _insert_raw(db, user.id, "Is a backend developer")
    response_json = (
        '[{"remove_ids": [1, 2], "replacement": {"content": "Works as a backend engineer", "category": "fact"}}]'
    )
    model = GenericFakeChatModel(messages=iter([AIMessage(content=response_json)]))

    plan = memory_service.plan_consolidation(db, user.id, model)

    assert len(plan) == 1
    assert len(plan[0].remove_entries) == 2
    assert plan[0].replacement == ("Works as a backend engineer", MemoryCategory.fact)


def test_plan_consolidation_ignores_an_action_with_an_unknown_id(db, user: User):
    _insert_raw(db, user.id, "Works as a backend engineer")
    _insert_raw(db, user.id, "Is a backend developer")
    # id 99 doesn't exist - a malformed/hallucinated response must be
    # dropped entirely, never cause a crash or a wrong deletion.
    response_json = '[{"remove_ids": [1, 99], "replacement": null}]'
    model = GenericFakeChatModel(messages=iter([AIMessage(content=response_json)]))

    assert memory_service.plan_consolidation(db, user.id, model) == []


def test_plan_consolidation_ignores_an_action_that_reuses_an_already_claimed_id(db, user: User):
    _insert_raw(db, user.id, "Works as a backend engineer")
    _insert_raw(db, user.id, "Is a backend developer")
    _insert_raw(db, user.id, "Owns a golden retriever named Max")
    # Two actions both claim id 1 - the second must be dropped, not applied
    # on top of (or instead of) the first.
    response_json = (
        "["
        '{"remove_ids": [1, 2], "replacement": {"content": "Works as a backend engineer", "category": "fact"}},'
        '{"remove_ids": [1, 3], "replacement": null}'
        "]"
    )
    model = GenericFakeChatModel(messages=iter([AIMessage(content=response_json)]))

    plan = memory_service.plan_consolidation(db, user.id, model)

    assert len(plan) == 1
    assert len(plan[0].remove_entries) == 2


def test_plan_consolidation_skips_a_noop_replacement_with_identical_content(db, user: User):
    _insert_raw(db, user.id, "Works as a backend engineer")
    _insert_raw(db, user.id, "Owns a golden retriever named Max")
    response_json = (
        '[{"remove_ids": [1], "replacement": {"content": "Works as a backend engineer", "category": "fact"}}]'
    )
    model = GenericFakeChatModel(messages=iter([AIMessage(content=response_json)]))

    assert memory_service.plan_consolidation(db, user.id, model) == []


def test_apply_consolidation_deletes_removed_entries_and_creates_the_replacement(db, user: User):
    stale_a = _insert_raw(db, user.id, "Works as a backend engineer")
    stale_b = _insert_raw(db, user.id, "Is a backend developer")
    kept = _insert_raw(db, user.id, "Owns a golden retriever named Max")
    plan = [ConsolidationAction(remove_entries=[stale_a, stale_b], replacement=("Works as a backend engineer", MemoryCategory.fact))]

    summary = memory_service.apply_consolidation(db, user.id, plan)

    assert summary == {"groups": 1, "removed": 2, "created": 1}
    remaining_contents = {e.content for e in memory_service.list_memories(db, user.id)}
    assert remaining_contents == {"Works as a backend engineer", "Owns a golden retriever named Max"}
    assert kept.content == "Owns a golden retriever named Max"


def test_apply_consolidation_can_remove_without_a_replacement(db, user: User):
    obsolete = _insert_raw(db, user.id, "Trial expires in 3 days")
    plan = [ConsolidationAction(remove_entries=[obsolete], replacement=None)]

    summary = memory_service.apply_consolidation(db, user.id, plan)

    assert summary == {"groups": 1, "removed": 1, "created": 0}
    assert memory_service.list_memories(db, user.id) == []
