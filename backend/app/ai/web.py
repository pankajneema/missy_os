import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from fastapi import HTTPException, status

_TIMEOUT_SECONDS = 15
_MAX_BYTES = 5 * 1024 * 1024  # 5MB - a page, not a video file
_MAX_REDIRECTS = 5
_STRIP_TAGS = ("script", "style", "nav", "footer", "header", "noscript", "svg")


def _is_public_url(url: str) -> bool:
    """Rejects anything that isn't a plain http(s) request to a public
    address - blocks SSRF against cloud metadata endpoints, localhost, and
    other internal-only services this backend can reach but shouldn't fetch
    on a user's behalf."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    try:
        addresses = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        return False
    for family, _type, _proto, _canonname, sockaddr in addresses:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


def fetch_page(url: str) -> tuple[str, str]:
    """Returns (title, plain_text). Strips scripts/nav/chrome, keeps visible content.

    Redirects are followed manually (not via requests' allow_redirects) so
    each hop is re-checked against _is_public_url - a public-looking URL
    that redirects to an internal address would otherwise bypass the check
    entirely.
    """
    for _ in range(_MAX_REDIRECTS + 1):
        if not _is_public_url(url):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="That URL points to a private/internal address, which isn't allowed.",
            )
        try:
            response = requests.get(
                url,
                timeout=_TIMEOUT_SECONDS,
                headers={"User-Agent": "Missy-OS/0.1 (personal knowledge base)"},
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Couldn't fetch that URL: {exc}") from exc

        if not response.is_redirect:
            break
        redirect_url = response.headers.get("Location")
        if not redirect_url:
            break
        url = urljoin(url, redirect_url)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many redirects.")

    try:
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
