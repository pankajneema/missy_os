from cryptography.fernet import Fernet

from app.core.config import get_settings

settings = get_settings()
_fernet = Fernet(settings.fernet_key.encode("utf-8"))


def encrypt_secret(plain_text: str) -> str:
    return _fernet.encrypt(plain_text.encode("utf-8")).decode("utf-8")


def decrypt_secret(cipher_text: str) -> str:
    return _fernet.decrypt(cipher_text.encode("utf-8")).decode("utf-8")


def mask_secret(plain_text: str, visible: int = 4) -> str:
    if len(plain_text) <= visible:
        return "*" * len(plain_text)
    return f"{'*' * (len(plain_text) - visible)}{plain_text[-visible:]}"
