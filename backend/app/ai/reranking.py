from functools import lru_cache

from sentence_transformers import CrossEncoder

from app.models.knowledge_chunk import KnowledgeChunk

# A cross-encoder scores (query, passage) pairs jointly - slower than the
# embedding model but far more precise, which is why it only runs on the
# small candidate pool hybrid search already narrowed things down to.
_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"


@lru_cache
def _get_model() -> CrossEncoder:
    return CrossEncoder(_MODEL_NAME)


def rerank(query: str, chunks: list[KnowledgeChunk], top_k: int) -> list[KnowledgeChunk]:
    if not chunks:
        return []
    pairs = [(query, chunk.content) for chunk in chunks]
    scores = _get_model().predict(pairs)
    ranked = sorted(zip(chunks, scores), key=lambda pair: pair[1], reverse=True)
    return [chunk for chunk, _ in ranked[:top_k]]
