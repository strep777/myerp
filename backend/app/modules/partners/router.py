from __future__ import annotations

from typing import Any, List, Optional, Type

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.partners import service
from app.modules.partners.schemas import (
    PartnerCreate,
    PartnerOption,
    PartnerOut,
    PartnerPage,
    PartnerUpdate,
)
from app.modules.users.models import User


def build_router(
    prefix: str,
    kind: str,
    model: Type[Any],
    label: str,
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=[label])
    read_roles = require_roles(
        Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER
    )
    write_roles = require_roles(Role.ADMIN, Role.MANAGER)

    @router.get("", response_model=PartnerPage, name=f"list_{kind}")
    def list_items(
        q: Optional[str] = None,
        is_active: Optional[bool] = None,
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
        db: Session = Depends(get_db),
        _: User = Depends(read_roles),
    ) -> dict:
        return service.list_partners(db, model, q, is_active, page, page_size)

    @router.get("/options", response_model=List[PartnerOption], name=f"options_{kind}")
    def options(
        q: Optional[str] = None,
        limit: int = Query(20, ge=1, le=50),
        db: Session = Depends(get_db),
        _: User = Depends(read_roles),
    ) -> List[Any]:
        return service.list_options(db, model, q, limit)

    @router.get("/{partner_id}", response_model=PartnerOut, name=f"get_{kind}")
    def get_item(
        partner_id: int,
        db: Session = Depends(get_db),
        _: User = Depends(read_roles),
    ) -> Any:
        return service.get_partner(db, model, partner_id, kind)

    @router.post(
        "",
        response_model=PartnerOut,
        status_code=status.HTTP_201_CREATED,
        name=f"create_{kind}",
    )
    def create_item(
        payload: PartnerCreate,
        db: Session = Depends(get_db),
        actor: User = Depends(write_roles),
    ) -> Any:
        return service.create_partner(db, model, payload, actor, kind)

    @router.patch("/{partner_id}", response_model=PartnerOut, name=f"update_{kind}")
    def update_item(
        partner_id: int,
        payload: PartnerUpdate,
        db: Session = Depends(get_db),
        actor: User = Depends(write_roles),
    ) -> Any:
        return service.update_partner(db, model, partner_id, payload, actor, kind)

    @router.delete(
        "/{partner_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        response_model=None,
        name=f"delete_{kind}",
    )
    def delete_item(
        partner_id: int,
        db: Session = Depends(get_db),
        actor: User = Depends(write_roles),
    ) -> None:
        service.delete_partner(db, model, partner_id, actor, kind)

    return router


router = build_router("/suppliers", "supplier", __import__(
    "app.modules.partners.models", fromlist=["Supplier"]
).Supplier, "供应商")

customer_router = build_router("/customers", "customer", __import__(
    "app.modules.partners.models", fromlist=["Customer"]
).Customer, "客户")
