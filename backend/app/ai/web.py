import requests
from bs4 import BeautifulSoup
from fastapi import HTTPException, status

_TIMEOUT_SECONDS = 15
_MAX_BYTES = 5 * 1024 * 1024  # 5MB - a page, not a video file
_STRIP_TAGS = ("script", "style", "nav", "footer", "header", "noscript", "svg")


def fetch_page(url: str) -> tuple[str, str]:
    """Returns (title, plain_text). Strips scripts/nav/chrome, keeps visible content."""
    try:
        response = requests.get(
            url, timeout=_TIMEOUT_SECONDS, headers={"User-Agent": "Missy-OS/0.1 (personal knowledge base)"}
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Couldn't fetch that URL: {exc}") from exc

    if len(response.content) > _MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That page is too large (max 5MB).")

    soup = BeautifulSoup(response.content, "html.parser")

    for tag_name in _STRIP_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else url
    text = soup.get_text(separator="\n", strip=True)

    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No readable text found on that page.")

    return title, text
