from typing import Any

import requests

from config import API_BASE_URL


class ApiError(Exception):
    """Raised with a message straight from the backend's `detail` field, so
    views can show it to the user as-is instead of a raw traceback."""


def _request(method: str, path: str, token: str | None = None, raw: bool = False, **kwargs: Any) -> Any:
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        response = requests.request(method, f"{API_BASE_URL}{path}", headers=headers, timeout=60, **kwargs)
    except requests.ConnectionError as exc:
        raise ApiError(f"Can't reach the Missy backend at {API_BASE_URL}. Is it running?") from exc

    if not response.ok:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise ApiError(detail)

    if raw:
        return response.content

    if response.status_code == 204 or not response.content:
        return None
    return response.json()


# --- Auth ---

def register(username: str, password: str) -> dict:
    return _request("POST", "/auth/register", json={"username": username, "password": password})


def login(username: str, password: str) -> dict:
    return _request("POST", "/auth/login", json={"username": username, "password": password})


def get_me(token: str) -> dict:
    return _request("GET", "/auth/me", token=token)


# --- Profile ---

def get_profile(token: str) -> dict | None:
    try:
        return _request("GET", "/profile", token=token)
    except ApiError:
        return None


def save_profile(
    token: str,
    assistant_name: str,
    persona_description: str,
    user_about_me: str,
    tone_preference: str | None,
    response_language: str,
) -> dict:
    return _request(
        "POST",
        "/profile",
        token=token,
        json={
            "assistant_name": assistant_name,
            "persona_description": persona_description,
            "user_about_me": user_about_me,
            "tone_preference": tone_preference,
            "response_language": response_language,
        },
    )


# --- Providers ---

def list_providers(token: str) -> list[dict]:
    return _request("GET", "/providers", token=token)


def save_provider(token: str, provider: str, api_key: str, model_name: str) -> dict:
    return _request(
        "POST",
        "/providers",
        token=token,
        json={"provider": provider, "api_key": api_key, "model_name": model_name},
    )


def delete_provider(token: str, provider: str) -> None:
    _request("DELETE", f"/providers/{provider}", token=token)


# --- Chat ---

def list_conversations(token: str) -> list[dict]:
    return _request("GET", "/conversations", token=token)


def create_conversation(token: str) -> dict:
    return _request("POST", "/conversations", token=token)


def get_messages(token: str, conversation_id: str) -> list[dict]:
    return _request("GET", f"/conversations/{conversation_id}/messages", token=token)


def send_message(
    token: str,
    conversation_id: str,
    content: str,
    provider: str,
    image: tuple[str, bytes, str] | None = None,
    document: tuple[str, bytes] | None = None,
    use_knowledge_base: bool = False,
) -> dict:
    """image: (filename, bytes, content_type); document: (filename, bytes)."""
    files = {}
    if image:
        filename, data, content_type = image
        files["image"] = (filename, data, content_type)
    if document:
        filename, data = document
        files["document"] = (filename, data)

    return _request(
        "POST",
        f"/conversations/{conversation_id}/messages",
        token=token,
        data={
            "content": content,
            "provider": provider,
            "use_knowledge_base": "true" if use_knowledge_base else "false",
        },
        files=files or None,
    )


# --- Voice ---

def transcribe_audio(token: str, filename: str, audio_bytes: bytes) -> str:
    result = _request(
        "POST",
        "/voice/transcribe",
        token=token,
        files={"audio": (filename, audio_bytes, "audio/wav")},
    )
    return result["text"]


def synthesize_speech(token: str, text: str, language: str) -> bytes:
    return _request(
        "POST",
        "/voice/speak",
        token=token,
        json={"text": text, "language": language},
        raw=True,
    )


# --- Knowledge base ---

def list_knowledge_sources(token: str) -> list[dict]:
    return _request("GET", "/knowledge/sources", token=token)


def add_knowledge_file(token: str, filename: str, content: bytes) -> dict:
    return _request(
        "POST", "/knowledge/sources/file", token=token, files={"file": (filename, content)}
    )


def add_knowledge_url(token: str, url: str) -> dict:
    return _request("POST", "/knowledge/sources/url", token=token, json={"url": url})


def add_knowledge_note(token: str, title: str, content: str) -> dict:
    return _request(
        "POST", "/knowledge/sources/note", token=token, json={"title": title, "content": content}
    )


def delete_knowledge_source(token: str, source_id: str) -> None:
    _request("DELETE", f"/knowledge/sources/{source_id}", token=token)
