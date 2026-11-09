from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.audit import service
from app.modules.audit.schemas import AuditLogPage
from app.modules.users.models import User


router = APIRouter(prefix="/audit-logs", tags=["审计"])
read_roles = require_roles(Role.ADMIN, Role.MANAGER)


@router.get("", response_model=AuditLogPage)
def list_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.list_logs(
        db,
        user_id,
        action,
        entity_type,
        date_from,
        date_to,
        q,
        page,
        page_size,
    )
