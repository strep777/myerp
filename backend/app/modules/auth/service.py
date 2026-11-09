from __future__ import annotations

import threading
import time
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.errors import AppError
from app.core.security import (
    dummy_password_hash,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.modules.users.models import User


FAILURE_WINDOW_SECONDS = 15 * 60
MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60

_failures: Dict[str, List[float]] = {}
_locked_until: Dict[str, float] = {}
_state_lock = threading.Lock()


def _key(ip: str, username: str) -> str:
    return f"{(ip or 'unknown').lower()}:{username.strip().lower()}"


def _prune(now: float) -> None:
    for key in list(_failures.keys()):
        _failures[key] = [ts for ts in _failures[key] if now - ts < FAILURE_WINDOW_SECONDS]
        if not _failures[key]:
            _failures.pop(key, None)
    for key in list(_locked_until.keys()):
        if _locked_until[key] <= now:
            _locked_until.pop(key, None)


def check_login_allowed(ip: str, username: str) -> None:
    now = time.monotonic()
    key = _key(ip, username)
    with _state_lock:
        if len(_failures) > 5000 or len(_locked_until) > 5000:
            _prune(now)
        locked = _locked_until.get(key, 0)
        if locked > now:
            remaining = max(1, int(locked - now))
            raise AppError(
                429,
                "RATE_LIMITED",
                f"登录尝试过多，请在 {remaining} 秒后重试",
            )


def record_login_failure(ip: str, username: str) -> None:
    now = time.monotonic()
    key = _key(ip, username)
    with _state_lock:
        attempts = [ts for ts in _failures.get(key, []) if now - ts < FAILURE_WINDOW_SECONDS]
        attempts.append(now)
        _failures[key] = attempts
        if len(attempts) >= MAX_FAILURES:
            _locked_until[key] = now + LOCK_SECONDS
            _failures.pop(key, None)


def clear_login_failures(ip: str, username: str) -> None:
    key = _key(ip, username)
    with _state_lock:
        _failures.pop(key, None)
        _locked_until.pop(key, None)


def _audit_failure(db: Session, username: str, reason: str, ip: str) -> None:
    write_audit(
        db,
        action="LOGIN_FAILED",
        entity_type="auth",
        entity_no=username,
        summary="登录失败",
        detail={"reason": reason},
        username=username,
        ip=ip,
    )
    db.commit()


def authenticate(db: Session, username: str, password: str, ip: str) -> User:
    normalized = username.strip().lower()
    check_login_allowed(ip, normalized)

    user = (
        db.query(User)
        .filter(func.lower(User.username) == normalized)
        .first()
    )
    if user is None:
        verify_password(password, dummy_password_hash())
        record_login_failure(ip, normalized)
        _audit_failure(db, normalized, "unknown_user", ip)
        raise AppError(401, "UNAUTHORIZED", "用户名或密码错误")

    if not verify_password(password, user.password_hash):
        record_login_failure(ip, normalized)
        _audit_failure(db, normalized, "bad_password", ip)
        raise AppError(401, "UNAUTHORIZED", "用户名或密码错误")

    if not user.is_active:
        record_login_failure(ip, normalized)
        _audit_failure(db, normalized, "inactive", ip)
        raise AppError(401, "UNAUTHORIZED", "用户名或密码错误")

    clear_login_failures(ip, normalized)
    return user


def login_succeeded(db: Session, user: User, ip: str) -> None:
    write_audit(
        db,
        action="LOGIN",
        entity_type="auth",
        entity_id=user.id,
        entity_no=user.username,
        summary="登录成功",
        user=user,
        ip=ip,
    )
    db.commit()


def logout(db: Session, user: User) -> None:
    user.token_version += 1
    write_audit(
        db,
        action="LOGOUT",
        entity_type="auth",
        entity_id=user.id,
        entity_no=user.username,
        summary="退出登录",
        user=user,
    )
    db.commit()


def change_password(
    db: Session,
    user: User,
    old_password: str,
    new_password: str,
) -> None:
    if not verify_password(old_password, user.password_hash):
        raise AppError(400, "INVALID_PASSWORD", "当前密码不正确")
    if old_password == new_password:
        raise AppError(400, "SAME_PASSWORD", "新密码不能与当前密码相同")
    problem = validate_password_strength(new_password, user.username)
    if problem:
        raise AppError(
            400,
            "WEAK_PASSWORD",
            problem,
            fields={"new_password": problem},
        )
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    user.must_change_password = False
    write_audit(
        db,
        action="PASSWORD_CHANGE",
        entity_type="user",
        entity_id=user.id,
        entity_no=user.username,
        summary="修改密码",
        user=user,
    )
    db.commit()


def user_from_id(db: Session, user_id: int) -> Optional[User]:
    return db.get(User, user_id)
