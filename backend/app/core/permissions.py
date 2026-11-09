from __future__ import annotations

from typing import Callable

from fastapi import Depends

from app.core.deps import get_current_user
from app.core.errors import AppError
from app.core.roles import Role
from app.modules.users.models import User


def require_roles(*roles: Role) -> Callable[..., User]:
    allowed = {role.value for role in roles}

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise AppError(403, "FORBIDDEN", "你没有执行此操作的权限")
        return user

    return dependency
