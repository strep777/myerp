from __future__ import annotations

import time
from datetime import timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db, utcnow
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.system.schemas import HealthOut, SystemInfoOut
from app.modules.users.models import User


router = APIRouter(prefix="/system", tags=["系统"])
STARTED_AT = time.monotonic()
read_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)


@router.get("/health", response_model=HealthOut)
def health() -> dict:
    return {
        "status": "ok",
        "time": utcnow().astimezone(timezone.utc),
        "version": settings.version,
    }


@router.get("/info", response_model=SystemInfoOut)
def info(
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    user_count = db.query(func.count(User.id)).scalar() or 0
    return {
        "name": settings.app_name,
        "version": settings.version,
        "timezone": settings.app_timezone,
        "database": "sqlite",
        "user_count": int(user_count),
        "uptime_seconds": int(time.monotonic() - STARTED_AT),
    }
