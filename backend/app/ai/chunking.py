from langchain_text_splitters import RecursiveCharacterTextSplitter

# Character-based, not token-based - simple and predictable for a personal
# knowledge base. Overlap keeps context from being severed mid-thought at
# chunk boundaries.
_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)


def split_text(text: str) -> list[str]:
    return [chunk for chunk in _splitter.split_text(text) if chunk.strip()]
