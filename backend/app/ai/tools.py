import ast
import operator
import uuid
from datetime import datetime, timezone

from langchain_core.tools import BaseTool, tool
from sqlalchemy.orm import Session

from app.ai.prompts import build_knowledge_context, build_knowledge_graph_context
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_entity import KnowledgeEntity
from app.models.knowledge_relationship import KnowledgeRelationship
from app.models.memory_entry import MemorySource
from app.repositories import knowledge_graph_repo
from app.services import knowledge_service, memory_service

_SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_OPERATORS:
        return _SAFE_OPERATORS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _SAFE_OPERATORS:
        return _SAFE_OPERATORS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("Unsupported expression")


def _format_relationship(entity: KnowledgeEntity, rel: KnowledgeRelationship) -> str:
    if rel.source_entity_id == entity.id:
        line = f"{entity.name} --[{rel.relationship_type}]--> {rel.target_entity.name}"
    else:
        line = f"{rel.source_entity.name} --[{rel.relationship_type}]--> {entity.name}"
    if rel.description:
        line += f" ({rel.description})"
    return line


def _find_mentioned_entities(db: Session, user_id: uuid.UUID, chunks: list[KnowledgeChunk]) -> list[KnowledgeEntity]:
    """Graph RAG: which of the user's known entities show up by name in these
    retrieved chunks. A plain substring match, not another LLM call - fast,
    free, and good enough at a personal-KB's scale (dozens to low hundreds
    of entities, not an enterprise graph)."""
    combined_text = " ".join(chunk.content for chunk in chunks).lower()
    all_entities = knowledge_graph_repo.list_entities_for_user(db, user_id)
    return [entity for entity in all_entities if entity.name.lower() in combined_text]


def build_tools(db: Session, user_id: uuid.UUID) -> list[BaseTool]:
    """Builds the tool set for one chat turn, closed over this request's db
    session and user - tools are plain functions the model calls by name and
    can't be handed request context as a normal argument, so it's captured
    in the closure instead."""

    @tool
    def search_knowledge_base(query: str) -> str:
        """Search the user's personal knowledge base (uploaded documents, notes, and saved URLs) for information relevant to a question - also automatically includes any known relationships (what things are used for, depend on, or were chosen because of) for entities mentioned in the results. Use this whenever the user asks about a specific document, topic, or fact they may have previously added to their knowledge base - do not rely on general knowledge for those questions."""
        chunks = knowledge_service.search(db, user_id, query)
        if not chunks:
            return "No relevant results found in the knowledge base."

        result = build_knowledge_context(chunks)

        # Graph RAG: enrich the chunk results with graph relationships for
        # any entity they mention, in the same call - the model doesn't have
        # to separately decide to call search_knowledge_graph too.
        seen_relationship_ids: set[uuid.UUID] = set()
        relationship_lines = []
        for entity in _find_mentioned_entities(db, user_id, chunks):
            for rel in knowledge_graph_repo.get_relationships_for_entity(db, user_id, entity.id):
                if rel.id in seen_relationship_ids:
                    continue
                seen_relationship_ids.add(rel.id)
                relationship_lines.append(_format_relationship(entity, rel))

        graph_context = build_knowledge_graph_context(relationship_lines)
        return f"{result}\n\n{graph_context}" if graph_context else result

    @tool
    def search_knowledge_graph(entity_name: str) -> str:
        """Search the user's knowledge graph for a specific named entity (a technology, product, organization, person, or concept) by name and see how it relates to other things - what it's used for, what it depends on, why it was chosen. Use this for a direct lookup of one specific entity by name; search_knowledge_base already includes graph relationships automatically for whatever it finds, so prefer this only when you need to look up an entity that a text search might not surface."""
        entities = knowledge_graph_repo.search_entities_by_name(db, user_id, entity_name)
        if not entities:
            return f"No entity matching '{entity_name}' found in the knowledge graph."

        lines = []
        for entity in entities:
            for rel in knowledge_graph_repo.get_relationships_for_entity(db, user_id, entity.id):
                lines.append(_format_relationship(entity, rel))

        if not lines:
            return f"Found '{entities[0].name}' in the knowledge graph, but no recorded relationships for it."
        return build_knowledge_graph_context(lines)

    @tool
    def remember_fact(fact: str) -> str:
        """Save a fact about the user permanently to memory, to be recalled in future conversations. Use this when the user explicitly asks you to remember something about them."""
        memory_service.remember(db, user_id, fact, MemorySource.manual)
        return f"Remembered: {fact}"

    @tool
    def get_current_datetime() -> str:
        """Get the current date and time. Use this for any question involving 'today', 'now', or date/time calculations - never guess the date."""
        return datetime.now(timezone.utc).strftime("%A, %B %d, %Y, %H:%M UTC")

    @tool
    def calculator(expression: str) -> str:
        """Evaluate an arithmetic expression, e.g. '12 * (7 + 3) / 2'. Use this for any nontrivial math instead of computing it yourself."""
        try:
            result = _safe_eval(ast.parse(expression, mode="eval").body)
        except Exception:
            return "Couldn't evaluate that - make sure it's a valid arithmetic expression."
        return str(result)

    return [search_knowledge_base, search_knowledge_graph, remember_fact, get_current_datetime, calculator]
