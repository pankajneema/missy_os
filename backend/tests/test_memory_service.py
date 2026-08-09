from app.models.memory_entry import MemorySource
from app.models.user import User
from app.services import memory_service


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
