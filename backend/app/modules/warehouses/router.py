from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.users.models import User
from app.modules.warehouses import service
from app.modules.warehouses.models import Warehouse
from app.modules.warehouses.schemas import (
    WarehouseCreate,
    WarehouseOption,
    WarehouseOut,
    WarehousePage,
    WarehouseUpdate,
)


router = APIRouter(prefix="/warehouses", tags=["仓库"])


@router.get("", response_model=WarehousePage)
def list_warehouses(
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)),
) -> dict:
    return service.list_warehouses(db, q, is_active, page, page_size)


@router.get("/options", response_model=List[WarehouseOption])
def warehouse_options(
    q: Optional[str] = None,
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)),
) -> List[Warehouse]:
    return service.list_options(db, q, limit)


@router.get("/{warehouse_id}", response_model=WarehouseOut)
def get_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)),
) -> Warehouse:
    warehouse = service.get_warehouse(db, warehouse_id)
    service._decorate(db, [warehouse])
    return warehouse


@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse(
    payload: WarehouseCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
) -> Warehouse:
    return service.create_warehouse(db, payload, actor)


@router.patch("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
) -> Warehouse:
    return service.update_warehouse(db, warehouse_id, payload, actor)


@router.delete("/{warehouse_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
) -> None:
    service.delete_warehouse(db, warehouse_id, actor)
