from __future__ import annotations

import json
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.context import current_request_ip
from app.modules.audit.models import AuditLog
from app.modules.users.models import User


def write_audit(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    entity_no: str = "",
    summary: str = "",
    detail: Optional[Any] = None,
    user: Optional[User] = None,
    username: Optional[str] = None,
    ip: Optional[str] = None,
) -> AuditLog:
    detail_text: Optional[str] = None
    if detail is not None:
        if isinstance(detail, str):
            detail_text = detail
        else:
            detail_text = json.dumps(detail, ensure_ascii=False, default=str)
    entry = AuditLog(
        user_id=user.id if user else None,
        username_snapshot=(user.username if user else (username or "system")),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_no=entity_no or "",
        summary=summary or "",
        detail=detail_text,
        ip=ip if ip is not None else current_request_ip(),
    )
    db.add(entry)
    return entry
