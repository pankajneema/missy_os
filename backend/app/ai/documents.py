import base64
import io

import docx
import pymupdf
import pytesseract
from fastapi import HTTPException, status
from PIL import Image
from pypdf import PdfReader

# Below this many characters, a pypdf extraction is treated as "no real text
# layer" (stray whitespace/artifacts, not an actual scanned page of content)
# and we fall back to OCR instead of returning near-nothing.
_MIN_TEXT_LAYER_CHARS = 20

# Only used by the V1 "attach a document to one chat turn" flow - keeps it
# inside typical context windows. Knowledge-base ingestion (V2) never
# truncates: the full document gets chunked instead.
_MAX_CHARS_PER_TURN = 40_000

IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def is_image_file(filename: str) -> bool:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return suffix in IMAGE_EXTENSIONS


def image_data_url(filename: str, content: bytes) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    content_type = "image/jpeg" if suffix == "jpg" else f"image/{suffix}"
    return f"data:{content_type};base64,{base64.b64encode(content).decode('utf-8')}"


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
    text = "\n\n".join(page.extract_text() or "" for page in reader.pages)

    if len(text.strip()) < _MIN_TEXT_LAYER_CHARS:
        return _ocr_pdf(content)
    return text


def _ocr_pdf(content: bytes) -> str:
    """Scanned/photographed PDFs have no embedded text layer for pypdf to
    read - render each page to an image and read it with Tesseract instead."""
    pages_text = []
    with pymupdf.open(stream=content, filetype="pdf") as pdf:
        for page in pdf:
            pixmap = page.get_pixmap(dpi=300)
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            pages_text.append(pytesseract.image_to_string(image))
    return "\n\n".join(pages_text)


def _extract_docx(content: bytes) -> str:
    document = docx.Document(io.BytesIO(content))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)
