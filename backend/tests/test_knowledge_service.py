from app.models.user import User
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
