from __future__ import annotations

from typing import Optional

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import TokenError, decode_access_token
from app.modules.users.models import User


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token: Optional[str] = request.cookies.get(settings.cookie_name)
    if not token:
        raise AppError(401, "UNAUTHORIZED", "请先登录")
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub", 0))
        token_version = int(payload.get("ver", -1))
    except (TokenError, TypeError, ValueError):
        raise AppError(401, "UNAUTHORIZED", "登录已失效，请重新登录")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError(401, "UNAUTHORIZED", "账号不存在或已停用")
    if user.token_version != token_version:
        raise AppError(401, "UNAUTHORIZED", "登录已失效，请重新登录")
    return user
