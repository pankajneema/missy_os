import io

import docx
from fastapi import HTTPException, status
from pypdf import PdfReader

# Only used by the V1 "attach a document to one chat turn" flow - keeps it
# inside typical context windows. Knowledge-base ingestion (V2) never
# truncates: the full document gets chunked instead.
_MAX_CHARS_PER_TURN = 40_000


def extract_text(filename: str, content: bytes) -> str:
    """Pulls the full raw text out of a document - no truncation, no
    chunking/embedding here. Callers decide what to do with it: chat_service
    truncates it for a single turn, knowledge ingestion chunks all of it."""
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if suffix == "pdf":
        text = _extract_pdf(content)
    elif suffix == "docx":
        text = _extract_docx(content)
    elif suffix in ("txt", "md"):
        text = content.decode("utf-8", errors="replace")
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported document type '.{suffix}' - use .pdf, .docx, .txt, or .md",
        )

    return text.strip()


def truncate_for_single_turn(text: str) -> str:
    if len(text) > _MAX_CHARS_PER_TURN:
        return text[:_MAX_CHARS_PER_TURN] + "\n\n[...document truncated - too long to fit in one message...]"
    return text


def _extract_pdf(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx(content: bytes) -> str:
    document = docx.Document(io.BytesIO(content))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)
