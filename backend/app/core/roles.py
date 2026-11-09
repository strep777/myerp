from __future__ import annotations

from enum import Enum


class Role(str, Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    OPERATOR = "OPERATOR"
    VIEWER = "VIEWER"


ROLE_LABELS = {
    Role.ADMIN.value: "管理员",
    Role.MANAGER.value: "主管",
    Role.OPERATOR.value: "操作员",
    Role.VIEWER.value: "只读",
}


def is_valid_role(value: str) -> bool:
    return value in {role.value for role in Role}
