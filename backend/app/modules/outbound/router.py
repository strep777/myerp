from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.outbound import service
from app.modules.outbound.schemas import (
    OutboundCreate,
    OutboundOrderOut,
    OutboundOrderPage,
)
from app.modules.users.models import User


router = APIRouter(prefix="/outbound-orders", tags=["出库"])
read_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)
write_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR)


@router.get("", response_model=OutboundOrderPage)
def list_orders(
    status_filter: Optional[str] = Query(None, alias="status"),
    warehouse_id: Optional[int] = None,
    customer_id: Optional[int] = None,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.list_orders(
        db,
        status_filter,
        warehouse_id,
        customer_id,
        q,
        date_from,
        date_to,
        page,
        page_size,
    )


@router.post("", response_model=OutboundOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OutboundCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.create_order(db, payload, actor)


@router.get("/{order_id}", response_model=OutboundOrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    order = service._get_order(db, order_id)
    return service._detail(db, order)


@router.put("/{order_id}", response_model=OutboundOrderOut)
def update_order(
    order_id: int,
    payload: OutboundCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.update_order(db, order_id, payload, actor)


@router.post("/{order_id}/confirm", response_model=OutboundOrderOut)
def confirm_order(
    order_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.confirm_order(db, order_id, actor)


@router.post("/{order_id}/cancel", response_model=OutboundOrderOut)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.cancel_order(db, order_id, actor)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> None:
    service.delete_order(db, order_id, actor)
