from langchain_core.messages import AIMessage, HumanMessage

from app.ai.chains import PostgresChatMessageHistory
from app.models.user import User
from app.repositories import conversation_repo, message_repo
from app.models.message import MessageRole


def test_messages_returns_everything_with_no_summary(db, user: User):
    conversation = conversation_repo.create(db, user.id)
    message_repo.create(db, conversation.id, MessageRole.user, "hi")
    message_repo.create(db, conversation.id, MessageRole.assistant, "hello")

    history = PostgresChatMessageHistory(conversation, db)

    assert len(history.messages) == 2


def test_messages_excludes_everything_up_to_and_including_the_summarized_cutoff(db, user: User):
    conversation = conversation_repo.create(db, user.id)
    message_repo.create(db, conversation.id, MessageRole.user, "old question")
    old2 = message_repo.create(db, conversation.id, MessageRole.assistant, "old answer")
    message_repo.create(db, conversation.id, MessageRole.user, "recent question")
    message_repo.create(db, conversation.id, MessageRole.assistant, "recent answer")
    conversation_repo.update_summary(db, conversation, "Discussed an old topic.", old2.id)
    db.refresh(conversation)

    history = PostgresChatMessageHistory(conversation, db)
    messages = history.messages

    assert len(messages) == 2
    assert all("recent" in m.content for m in messages)


def test_add_message_persists_through_the_conversation_object(db, user: User):
    conversation = conversation_repo.create(db, user.id)
    history = PostgresChatMessageHistory(conversation, db)

    history.add_message(HumanMessage(content="hi"))
    history.add_message(AIMessage(content="hello"))

    rows = message_repo.list_by_conversation(db, conversation.id)
    assert [r.content for r in rows] == ["hi", "hello"]
