import uuid

from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from sqlalchemy.orm import Session

from app.models.message import MessageRole
from app.repositories import message_repo


class PostgresChatMessageHistory(BaseChatMessageHistory):
    """Reads/writes chat turns straight from the `messages` table.

    We already persist every turn relationally (so the REST API can list
    messages independent of LangChain), so this class is a thin adapter
    rather than a second source of truth: `messages` is read fresh from
    Postgres, and `add_message` writes straight back through the same
    repository.
    """

    def __init__(self, conversation_id: uuid.UUID, db: Session):
        self.conversation_id = conversation_id
        self.db = db

    @property
    def messages(self) -> list[BaseMessage]:
        rows = message_repo.list_by_conversation(self.db, self.conversation_id)
        return [
            HumanMessage(content=row.content) if row.role == MessageRole.user else AIMessage(content=row.content)
            for row in rows
        ]

    def add_message(self, message: BaseMessage) -> None:
        role = MessageRole.user if isinstance(message, HumanMessage) else MessageRole.assistant
        message_repo.create(self.db, conversation_id=self.conversation_id, role=role, content=message.content)

    def clear(self) -> None:
        message_repo.delete_by_conversation(self.db, self.conversation_id)
