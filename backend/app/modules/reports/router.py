from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.reports import service
from app.modules.reports.schemas import (
    FlowSummaryPage,
    LowStockPage,
    StockReportPage,
)
from app.modules.users.models import User


router = APIRouter(prefix="/reports", tags=["报表"])
read_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)


@router.get("/stock-summary", response_model=StockReportPage)
def stock_summary(
    warehouse_id: Optional[int] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    include_zero: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.stock_summary(
        db, warehouse_id, category, q, include_zero, page, page_size
    )


@router.get("/low-stock", response_model=LowStockPage)
def low_stock(
    warehouse_id: Optional[int] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.low_stock(db, warehouse_id, category, q, page, page_size)


@router.get("/flow-summary", response_model=FlowSummaryPage)
def flow_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    warehouse_id: Optional[int] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.flow_summary(
        db, date_from, date_to, warehouse_id, category, q, page, page_size
    )


@router.get("/ledger")
def ledger_report(
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref_no: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    from app.modules.inventory import service as inventory_service

    return inventory_service.list_ledger(
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


@router.get("/export/stock.csv", response_class=Response)
def export_stock(
    warehouse_id: Optional[int] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    include_zero: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> Response:
    return service.export_stock(db, warehouse_id, category, q, include_zero)


@router.get("/export/ledger.csv", response_class=Response)
def export_ledger(
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref_no: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> Response:
    return service.export_ledger(
        db, product_id, warehouse_id, movement_type, date_from, date_to, ref_no
    )


@router.get("/export/flow.csv", response_class=Response)
def export_flow(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    warehouse_id: Optional[int] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> Response:
    return service.export_flow(db, date_from, date_to, warehouse_id, category, q)
