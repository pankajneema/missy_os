from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import MessageRole
from app.repositories import message_repo


class PostgresChatMessageHistory(BaseChatMessageHistory):
    """Reads/writes chat turns straight from the `messages` table.

    We already persist every turn relationally (so the REST API can list
    messages independent of LangChain), so this class is a thin adapter
    rather than a second source of truth: `messages` is read fresh from
    Postgres, and `add_message` writes straight back through the same
    repository.

    If the conversation has been compressed (see
    app/services/conversation_summary_service.py), `.messages` only returns
    the raw tail AFTER summarized_through_message_id - the folded-away
    portion is never deleted from the table, just excluded from what gets
    replayed to the model. The summary text itself isn't returned here; the
    caller injects it separately (see build_conversation_summary_context).
    """

    def __init__(self, conversation: Conversation, db: Session):
        self.conversation = conversation
        self.db = db

    @property
    def messages(self) -> list[BaseMessage]:
        rows = message_repo.list_by_conversation(self.db, self.conversation.id)
        cutoff_id = self.conversation.summarized_through_message_id
        if cutoff_id is not None:
            for i, row in enumerate(rows):
                if row.id == cutoff_id:
                    rows = rows[i + 1 :]
                    break
        return [
            HumanMessage(content=row.content) if row.role == MessageRole.user else AIMessage(content=row.content)
            for row in rows
        ]

    def add_message(self, message: BaseMessage) -> None:
        role = MessageRole.user if isinstance(message, HumanMessage) else MessageRole.assistant
        message_repo.create(self.db, conversation_id=self.conversation.id, role=role, content=message.content)

    def clear(self) -> None:
        message_repo.delete_by_conversation(self.db, self.conversation.id)
