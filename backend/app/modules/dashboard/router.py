from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import AppError
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.dashboard import service
from app.modules.dashboard.schemas import (
    DashboardSummary,
    LowStockResponse,
    RecentDocumentsResponse,
    TrendResponse,
)
from app.modules.users.models import User


router = APIRouter(prefix="/dashboard", tags=["工作台"])
read_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)


@router.get("/summary", response_model=DashboardSummary)
def summary(
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.summary(db, warehouse_id)


@router.get("/trend", response_model=TrendResponse)
def trend(
    days: int = Query(7),
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    if days not in (7, 30):
        raise AppError(400, "INVALID_DAYS", "趋势天数只支持 7 或 30")
    return service.trend(db, days, warehouse_id)


@router.get("/recent-documents", response_model=RecentDocumentsResponse)
def recent_documents(
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.recent_documents(db, limit)


@router.get("/low-stock", response_model=LowStockResponse)
def low_stock(
    limit: int = Query(5, ge=1, le=20),
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.low_stock(db, limit, warehouse_id)
