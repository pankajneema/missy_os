import json
from typing import Any

import requests

from config import API_BASE_URL


class ApiError(Exception):
    """Raised with a message straight from the backend's `detail` field, so
    views can show it to the user as-is instead of a raw traceback."""


def _format_detail(detail: Any) -> str:
    """FastAPI's own 422 validation errors put a LIST of error dicts in
    `detail` (not a string like every other error path here) - stringifying
    that raw would show something like "[{'type': 'value_error', 'loc': ...
    'msg': ...}]" instead of a readable message."""
    if isinstance(detail, list):
        return "; ".join(item.get("msg", str(item)) if isinstance(item, dict) else str(item) for item in detail)
    return str(detail)


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
        raise ApiError(_format_detail(detail))

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


def save_provider(token: str, provider: str, api_key: str, model_name: str, name: str | None = None) -> dict:
    return _request(
        "POST",
        "/providers",
        token=token,
        json={"provider": provider, "api_key": api_key, "model_name": model_name, "name": name},
    )


def delete_provider(token: str, provider: str) -> None:
    _request("DELETE", f"/providers/{provider}", token=token)


def set_provider_revoked(token: str, provider: str, revoked: bool) -> dict:
    return _request("POST", f"/providers/{provider}/revoke", token=token, json={"revoked": revoked})


def test_provider(token: str, provider: str, api_key: str, model_name: str) -> dict:
    """Never raises on a failed connection test - success=False + message is
    the expected, normal outcome for a bad key, not an ApiError."""
    return _request(
        "POST",
        "/providers/test",
        token=token,
        json={"provider": provider, "api_key": api_key, "model_name": model_name},
    )


# --- MCP servers ---

def list_mcp_servers(token: str) -> list[dict]:
    return _request("GET", "/mcp-servers", token=token)


def add_mcp_server(
    token: str,
    name: str,
    transport: str,
    command: str | None = None,
    args: list[str] | None = None,
    url: str | None = None,
    env: dict[str, str] | None = None,
) -> dict:
    return _request(
        "POST",
        "/mcp-servers",
        token=token,
        json={"name": name, "transport": transport, "command": command, "args": args, "url": url, "env": env},
    )


def set_mcp_server_enabled(token: str, server_id: str, enabled: bool) -> dict:
    return _request("POST", f"/mcp-servers/{server_id}/enabled", token=token, json={"enabled": enabled})


def delete_mcp_server(token: str, server_id: str) -> None:
    _request("DELETE", f"/mcp-servers/{server_id}", token=token)


# --- Chat ---

def list_conversations(token: str) -> list[dict]:
    return _request("GET", "/conversations", token=token)


def create_conversation(token: str) -> dict:
    return _request("POST", "/conversations", token=token)


def get_messages(token: str, conversation_id: str) -> list[dict]:
    return _request("GET", f"/conversations/{conversation_id}/messages", token=token)


def get_pending_confirmation(token: str, conversation_id: str) -> dict | None:
    return _request("GET", f"/conversations/{conversation_id}/pending-confirmation", token=token)


def _stream_ndjson(method: str, path: str, token: str, **kwargs: Any):
    """Yields parsed event dicts as they arrive - {"type": "status"|"token",
    ...} while the reply is being generated, then a final {"type": "done"|
    "needs_confirmation"|"error", ...}. Validation errors (bad conversation,
    revoked credential, etc.) happen before the backend starts streaming, so
    they still arrive as a normal non-200 response, not a stream event."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.request(method, f"{API_BASE_URL}{path}", headers=headers, timeout=120, stream=True, **kwargs)
    except requests.ConnectionError as exc:
        raise ApiError(f"Can't reach the Missy backend at {API_BASE_URL}. Is it running?") from exc

    if not response.ok:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise ApiError(_format_detail(detail))

    for line in response.iter_lines():
        if line:
            yield json.loads(line)


def stream_message(
    token: str,
    conversation_id: str,
    content: str,
    provider: str,
    image: tuple[str, bytes, str] | None = None,
    document: tuple[str, bytes] | None = None,
):
    """image: (filename, bytes, content_type); document: (filename, bytes)."""
    files = {}
    if image:
        filename, data, content_type = image
        files["image"] = (filename, data, content_type)
    if document:
        filename, data = document
        files["document"] = (filename, data)

    yield from _stream_ndjson(
        "POST",
        f"/conversations/{conversation_id}/messages",
        token,
        data={"content": content, "provider": provider},
        files=files or None,
    )


def stream_confirm_tool_call(token: str, conversation_id: str, confirmation_id: str, approved: bool):
    """Approving one risky tool call can still lead straight into another
    (e.g. write then delete), which needs its own approval before the turn
    is done - the caller should keep watching for a "needs_confirmation" event."""
    yield from _stream_ndjson(
        "POST",
        f"/conversations/{conversation_id}/messages/{confirmation_id}/confirm",
        token,
        json={"approved": approved},
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


# --- Memory ---

def list_memories(token: str) -> list[dict]:
    return _request("GET", "/memory", token=token)


def add_memory(token: str, content: str, category: str = "fact") -> dict:
    return _request("POST", "/memory", token=token, json={"content": content, "category": category})


def delete_memory(token: str, memory_id: str) -> None:
    _request("DELETE", f"/memory/{memory_id}", token=token)
