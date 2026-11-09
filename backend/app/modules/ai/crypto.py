from __future__ import annotations

import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.security import get_secret_key


def _fernet() -> Fernet:
    digest = hashlib.sha256(get_secret_key().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> Optional[str]:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def mask_secret(value: str) -> str:
    clean = (value or "").strip()
    if len(clean) <= 4:
        return "••••" if clean else ""
    return f"••••{clean[-4:]}"
