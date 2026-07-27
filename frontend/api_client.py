from typing import Any

import requests

from config import API_BASE_URL


class ApiError(Exception):
    """Raised with a message straight from the backend's `detail` field, so
    views can show it to the user as-is instead of a raw traceback."""


def _request(method: str, path: str, token: str | None = None, **kwargs: Any) -> Any:
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
    token: str, assistant_name: str, persona_description: str, user_about_me: str, tone_preference: str | None
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


def send_message(token: str, conversation_id: str, content: str, provider: str) -> dict:
    return _request(
        "POST",
        f"/conversations/{conversation_id}/messages",
        token=token,
        json={"content": content, "provider": provider},
    )
