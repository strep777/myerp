from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.products import service
from app.modules.products.models import Product
from app.modules.products.schemas import (
    ProductCreate,
    ProductOption,
    ProductOut,
    ProductPage,
    ProductStockClearOut,
    ProductUpdate,
)
from app.modules.users.models import User


router = APIRouter(prefix="/products", tags=["商品"])


@router.get("", response_model=ProductPage)
def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)),
) -> dict:
    return service.list_products(db, q, category, is_active, page, page_size)


@router.get("/options", response_model=List[ProductOption])
def product_options(
    q: Optional[str] = None,
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)),
) -> List[Product]:
    return service.list_options(db, q, limit)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER)),
) -> Product:
    product = service.get_product(db, product_id)
    service._decorate(db, [product])
    return product


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
) -> Product:
    return service.create_product(db, payload, actor)


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
) -> Product:
    return service.update_product(db, product_id, payload, actor)


@router.post("/{product_id}/clear-stock", response_model=ProductStockClearOut)
def clear_stock(
    product_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
) -> dict:
    return service.clear_stock(db, product_id, actor)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
) -> None:
    service.delete_product(db, product_id, actor)
