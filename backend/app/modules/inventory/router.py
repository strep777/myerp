from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.inventory import service
from app.modules.inventory.schemas import (
    AdjustmentCreate,
    AdjustmentResult,
    BalancePage,
    InventoryOverview,
    LedgerPage,
)
from app.modules.users.models import User


router = APIRouter(prefix="/inventory", tags=["库存"])
read_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)
write_roles = require_roles(Role.ADMIN, Role.MANAGER)


@router.get("/balances", response_model=BalancePage)
def list_balances(
    warehouse_id: Optional[int] = None,
    q: Optional[str] = None,
    category: Optional[str] = None,
    low_stock: Optional[bool] = None,
    include_zero: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.list_balances(
        db, warehouse_id, q, category, low_stock, include_zero, page, page_size
    )


@router.get("/ledger", response_model=LedgerPage)
def list_ledger(
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref_no: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.list_ledger(
        db,
        product_id,
        warehouse_id,
        movement_type,
        date_from,
        date_to,
        ref_no,
        page,
        page_size,
    )


@router.get("/overview", response_model=InventoryOverview)
def get_overview(
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.overview(db, warehouse_id)


@router.post("/adjustments", response_model=AdjustmentResult)
def adjust_stock(
    payload: AdjustmentCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.adjust_stock(db, payload, actor)
