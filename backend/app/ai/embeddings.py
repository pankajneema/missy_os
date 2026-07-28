from functools import lru_cache

from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"  # 384-dim, CPU-friendly, no API key needed


@lru_cache
def _get_model() -> SentenceTransformer:
    # Loaded once per process - this is the slow part (downloads the model
    # the very first time), every call after this reuses the cached instance.
    return SentenceTransformer(_MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors = _get_model().encode(texts, normalize_embeddings=True)
    return vectors.tolist()


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]
