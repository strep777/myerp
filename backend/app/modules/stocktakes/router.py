from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.stocktakes import service
from app.modules.stocktakes.schemas import (
    StocktakeCreate,
    StocktakeLinesUpdate,
    StocktakeOut,
    StocktakePage,
)
from app.modules.users.models import User


router = APIRouter(prefix="/stocktakes", tags=["盘点"])
read_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)
write_roles = require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR)


@router.get("", response_model=StocktakePage)
def list_stocktakes(
    status_filter: Optional[str] = Query(None, alias="status"),
    warehouse_id: Optional[int] = None,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    return service.list_stocktakes(
        db, status_filter, warehouse_id, q, date_from, date_to, page, page_size
    )


@router.post("", response_model=StocktakeOut, status_code=status.HTTP_201_CREATED)
def create_stocktake(
    payload: StocktakeCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.create_stocktake(db, payload, actor)


@router.get("/{stocktake_id}", response_model=StocktakeOut)
def get_stocktake(
    stocktake_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(read_roles),
) -> dict:
    stocktake = service._get_stocktake(db, stocktake_id)
    return service._detail(db, stocktake)


@router.put("/{stocktake_id}/lines", response_model=StocktakeOut)
def update_lines(
    stocktake_id: int,
    payload: StocktakeLinesUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.update_lines(db, stocktake_id, payload, actor)


@router.post("/{stocktake_id}/complete", response_model=StocktakeOut)
def complete_stocktake(
    stocktake_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.complete_stocktake(db, stocktake_id, actor)


@router.post("/{stocktake_id}/cancel", response_model=StocktakeOut)
def cancel_stocktake(
    stocktake_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> dict:
    return service.cancel_stocktake(db, stocktake_id, actor)


@router.delete("/{stocktake_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_stocktake(
    stocktake_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(write_roles),
) -> None:
    service.delete_stocktake(db, stocktake_id, actor)
