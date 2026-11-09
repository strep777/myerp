from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import jwt

from app.core.config import settings


PBKDF2_ITERATIONS = 600_000
PBKDF2_ALGORITHM = "sha256"
PASSWORD_SCHEME = "pbkdf2_sha256"
_ACCESS_TOKEN_ALGORITHM = "HS256"

_generated_secret: Optional[str] = None


class TokenError(Exception):
    pass


def get_secret_key() -> str:
    global _generated_secret
    if settings.secret_key:
        if len(settings.secret_key) < 32:
            raise RuntimeError("SECRET_KEY 至少需要 32 个字符")
        return settings.secret_key
    if _generated_secret:
        return _generated_secret

    data_dir = settings.data_dir
    if data_dir is None:
        _generated_secret = secrets.token_urlsafe(48)
        return _generated_secret

    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / "secret.key"
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if len(value) >= 32:
            _generated_secret = value
            return value
    value = secrets.token_urlsafe(48)
    path.write_text(value, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    _generated_secret = value
    return value


def _b64encode(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.b64decode(value.encode("ascii"))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM, password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return f"{PASSWORD_SCHEME}${PBKDF2_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations_raw, salt_raw, digest_raw = encoded.split("$")
        if scheme != PASSWORD_SCHEME:
            return False
        iterations = int(iterations_raw)
        salt = _b64decode(salt_raw)
        expected = _b64decode(digest_raw)
    except (ValueError, TypeError):
        return False
    actual = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM, password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(actual, expected)


_dummy_hash: Optional[str] = None


def dummy_password_hash() -> str:
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password("__invalid_user_dummy__")
    return _dummy_hash


def validate_password_strength(password: str, username: str = "") -> Optional[str]:
    if len(password) < 8:
        return "密码至少 8 个字符"
    if len(password) > 64:
        return "密码最多 64 个字符"
    if not any(ch.isalpha() for ch in password):
        return "密码必须包含字母"
    if not any(ch.isdigit() for ch in password):
        return "密码必须包含数字"
    if username and len(username) >= 3 and username.lower() in password.lower():
        return "密码不能包含用户名"
    return None


def create_access_token(user_id: int, role: str, token_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "ver": int(token_version),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.jwt_expire_hours)).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, get_secret_key(), algorithm=_ACCESS_TOKEN_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            get_secret_key(),
            algorithms=[_ACCESS_TOKEN_ALGORITHM],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("登录已过期，请重新登录") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("登录凭证无效") from exc
    return payload


def cookie_max_age() -> int:
    return settings.jwt_expire_hours * 3600


def secret_file_path() -> Optional[Path]:
    data_dir = settings.data_dir
    return data_dir / "secret.key" if data_dir else None
