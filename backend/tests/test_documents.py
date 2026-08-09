import io

import pymupdf
from PIL import Image, ImageDraw

from app.ai.documents import extract_text


def _digital_pdf(text: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    content = doc.tobytes()
    doc.close()
    return content


def _scanned_pdf(text: str) -> bytes:
    """An image-only PDF with no embedded text layer - the same shape of
    document as a photographed/scanned page, which pypdf alone can't read."""
    image = Image.new("RGB", (800, 200), color="white")
    ImageDraw.Draw(image).text((20, 80), text, fill="black")
    buf = io.BytesIO()
    image.save(buf, format="PDF")
    return buf.getvalue()


def test_extracts_text_directly_from_a_digital_pdf():
    result = extract_text("normal.pdf", _digital_pdf("Hello from a normal PDF."))
    assert result == "Hello from a normal PDF."


def test_falls_back_to_ocr_for_a_scanned_pdf():
    result = extract_text("scanned.pdf", _scanned_pdf("TOTAL MARKS 487"))
    assert "487" in result
