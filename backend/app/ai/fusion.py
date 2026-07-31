import uuid

from app.models.knowledge_chunk import KnowledgeChunk

_RRF_K = 60  # standard constant from the original RRF paper - de-emphasizes rank-1 dominance


def reciprocal_rank_fusion(*ranked_lists: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
    """Merges multiple independently-ranked result lists (e.g. vector search
    + keyword search) into one ranking. A chunk that shows up near the top of
    BOTH lists outranks one that's #1 in only one - this is what makes hybrid
    search actually better than either method alone, not just a coin flip
    between them."""
    scores: dict[uuid.UUID, float] = {}
    chunks_by_id: dict[uuid.UUID, KnowledgeChunk] = {}

    for ranked_list in ranked_lists:
        for rank, chunk in enumerate(ranked_list):
            scores[chunk.id] = scores.get(chunk.id, 0.0) + 1.0 / (_RRF_K + rank + 1)
            chunks_by_id[chunk.id] = chunk

    fused_ids = sorted(scores, key=lambda chunk_id: scores[chunk_id], reverse=True)
    return [chunks_by_id[chunk_id] for chunk_id in fused_ids]
