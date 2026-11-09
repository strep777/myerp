from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.transfers import service
from app.modules.transfers.schemas import (
    TransferCreate,
    TransferOrderOut,
    TransferOrderPage,
)
from app.modules.users.models import User


router = APIRouter(prefix="/transfer-orders", tags=["调拨"])
read_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)
write_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR)


@router.get("", response_model=TransferOrderPage)
def list_orders(
    status_filter: Optional[str] = Query(None, alias="status"),
    from_warehouse_id: Optional[int] = None,
    to_warehouse_id: Optional[int] = None,
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
        from_warehouse_id,
        to_warehouse_id,
        q,
        date_from,
        date_to,
        page,
        page_size,
    )


@router.post("", response_model=TransferOrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: TransferCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.create_order(db, payload, actor)


@router.get("/{order_id}", response_model=TransferOrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    order = service._get_order(db, order_id)
    return service._detail(db, order)


@router.put("/{order_id}", response_model=TransferOrderOut)
def update_order(
    order_id: int,
    payload: TransferCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.update_order(db, order_id, payload, actor)


@router.post("/{order_id}/confirm", response_model=TransferOrderOut)
def confirm_order(
    order_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.confirm_order(db, order_id, actor)


@router.post("/{order_id}/cancel", response_model=TransferOrderOut)
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
