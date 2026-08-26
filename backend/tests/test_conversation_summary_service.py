from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from app.models.message import MessageRole
from app.models.user import User
from app.repositories import conversation_repo, message_repo
from app.services import conversation_summary_service


def _seed_messages(db, conversation_id, count: int) -> None:
    for i in range(count):
        role = MessageRole.user if i % 2 == 0 else MessageRole.assistant
        message_repo.create(db, conversation_id, role, f"message {i}")


def test_maybe_compress_does_nothing_under_the_threshold(db, user: User):
    conversation = conversation_repo.create(db, user.id)
    _seed_messages(db, conversation.id, 10)
    model = GenericFakeChatModel(messages=iter([AIMessage(content="should never be called")]))

    conversation_summary_service.maybe_compress(db, conversation, model)

    db.refresh(conversation)
    assert conversation.summary is None
    assert conversation.summarized_through_message_id is None


def test_maybe_compress_summarizes_the_old_tail_and_keeps_the_recent_messages_raw(db, user: User):
    conversation = conversation_repo.create(db, user.id)
    _seed_messages(db, conversation.id, 45)  # over the 40-message threshold
    model = GenericFakeChatModel(messages=iter([AIMessage(content="A condensed recap of the older messages.")]))

    conversation_summary_service.maybe_compress(db, conversation, model)

    db.refresh(conversation)
    assert conversation.summary == "A condensed recap of the older messages."
    assert conversation.summarized_through_message_id is not None

    all_rows = message_repo.list_by_conversation(db, conversation.id)
    cutoff_index = next(i for i, r in enumerate(all_rows) if r.id == conversation.summarized_through_message_id)
    # Exactly the most recent 20 remain after the cutoff - never folded away.
    assert len(all_rows) - (cutoff_index + 1) == 20
    # Nothing was actually deleted - the full raw history is still there.
    assert len(all_rows) == 45


def test_maybe_compress_folds_a_previous_summary_into_the_new_one(db, user: User):
    conversation = conversation_repo.create(db, user.id)
    _seed_messages(db, conversation.id, 45)
    first_model = GenericFakeChatModel(messages=iter([AIMessage(content="First recap.")]))
    conversation_summary_service.maybe_compress(db, conversation, first_model)
    db.refresh(conversation)

    _seed_messages(db, conversation.id, 30)  # push the un-summarized tail back over the threshold
    db.refresh(conversation)

    captured_prompt = {}

    class _CapturingModel(GenericFakeChatModel):
        def invoke(self, messages, *a, **k):
            captured_prompt["text"] = messages[-1].content
            return AIMessage(content="Second, merged recap.")

    conversation_summary_service.maybe_compress(db, conversation, _CapturingModel(messages=iter([])))

    assert "First recap." in captured_prompt["text"]
    db.refresh(conversation)
    assert conversation.summary == "Second, merged recap."


def test_maybe_compress_never_raises_when_the_model_call_fails(db, user: User):
    conversation = conversation_repo.create(db, user.id)
    _seed_messages(db, conversation.id, 45)

    class _ExplodingModel:
        def invoke(self, *a, **k):
            raise RuntimeError("provider is down")

    conversation_summary_service.maybe_compress(db, conversation, _ExplodingModel())

    db.refresh(conversation)
    assert conversation.summary is None
