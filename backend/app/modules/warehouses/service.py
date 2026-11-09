from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.database import q4
from app.core.errors import AppError
from app.core.pagination import page_payload, paginate
from app.modules.inbound.models import InboundOrder
from app.modules.inventory.models import InventoryBalance
from app.modules.outbound.models import OutboundOrder
from app.modules.stocktakes.models import Stocktake
from app.modules.transfers.models import TransferOrder
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse
from app.modules.warehouses.schemas import WarehouseCreate, WarehouseUpdate


def _totals(db: Session, warehouse_ids: List[int]) -> dict:
    if not warehouse_ids:
        return {}
    rows = (
        db.query(
            InventoryBalance.warehouse_id,
            func.count(func.distinct(InventoryBalance.product_id)),
            func.coalesce(func.sum(InventoryBalance.quantity), 0),
        )
        .filter(
            InventoryBalance.warehouse_id.in_(warehouse_ids),
            InventoryBalance.quantity > 0,
        )
        .group_by(InventoryBalance.warehouse_id)
        .all()
    )
    return {row[0]: (int(row[1]), q4(row[2])) for row in rows}


def _decorate(db: Session, warehouses: List[Warehouse]) -> None:
    totals = _totals(db, [w.id for w in warehouses])
    for warehouse in warehouses:
        count, quantity = totals.get(warehouse.id, (0, Decimal("0")))
        warehouse.sku_count = count
        warehouse.total_quantity = float(quantity)


def list_warehouses(
    db: Session,
    q: Optional[str],
    is_active: Optional[bool],
    page: int,
    page_size: int,
) -> dict:
    query = db.query(Warehouse)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Warehouse.code.ilike(term),
                Warehouse.name.ilike(term),
                Warehouse.location.ilike(term),
            )
        )
    if is_active is not None:
        query = query.filter(Warehouse.is_active == is_active)
    query = query.order_by(Warehouse.id.asc())
    items, total = paginate(query, page, page_size)
    _decorate(db, items)
    return page_payload(items, total, page, page_size)


def list_options(db: Session, q: Optional[str], limit: int) -> List[Warehouse]:
    query = db.query(Warehouse).filter(Warehouse.is_active.is_(True))
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(Warehouse.code.ilike(term), Warehouse.name.ilike(term))
        )
    return query.order_by(Warehouse.code.asc()).limit(limit).all()


def get_warehouse(db: Session, warehouse_id: int) -> Warehouse:
    warehouse = db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise AppError(404, "WAREHOUSE_NOT_FOUND", "仓库不存在")
    return warehouse


def _ensure_code(db: Session, code: Optional[str], exclude_id: Optional[int] = None) -> None:
    if not code:
        return
    query = db.query(Warehouse).filter(Warehouse.code == code)
    if exclude_id:
        query = query.filter(Warehouse.id != exclude_id)
    if query.first():
        raise AppError(
            409,
            "WAREHOUSE_CODE_EXISTS",
            "仓库编码已存在",
            fields={"code": "仓库编码已存在"},
        )


def create_warehouse(
    db: Session, payload: WarehouseCreate, actor: User
) -> Warehouse:
    _ensure_code(db, payload.code)
    if not payload.is_active:
        active_count = (
            db.query(Warehouse).filter(Warehouse.is_active.is_(True)).count()
        )
        if active_count == 0:
            raise AppError(409, "LAST_WAREHOUSE", "必须至少保留一个启用的仓库")
    warehouse = Warehouse(
        code=payload.code,
        name=payload.name,
        location=payload.location,
        manager=payload.manager,
        remark=payload.remark,
        is_active=payload.is_active,
    )
    db.add(warehouse)
    try:
        db.flush()
        write_audit(
            db,
            action="CREATE",
            entity_type="warehouse",
            entity_id=warehouse.id,
            entity_no=warehouse.code,
            summary=f"创建仓库 {warehouse.name}",
            user=actor,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "WAREHOUSE_CODE_EXISTS", "仓库编码已存在")
    db.refresh(warehouse)
    warehouse.sku_count = 0
    warehouse.total_quantity = 0
    return warehouse


def update_warehouse(
    db: Session,
    warehouse_id: int,
    payload: WarehouseUpdate,
    actor: User,
) -> Warehouse:
    warehouse = get_warehouse(db, warehouse_id)
    changes = payload.model_dump(exclude_unset=True)
    _ensure_code(db, changes.get("code"), exclude_id=warehouse.id)

    new_active = changes.get("is_active", warehouse.is_active)
    if warehouse.is_active and not new_active:
        other_active = (
            db.query(Warehouse)
            .filter(Warehouse.is_active.is_(True), Warehouse.id != warehouse.id)
            .count()
        )
        if other_active == 0:
            raise AppError(409, "LAST_WAREHOUSE", "必须至少保留一个启用的仓库")
        total = (
            db.query(func.coalesce(func.sum(InventoryBalance.quantity), 0))
            .filter(InventoryBalance.warehouse_id == warehouse.id)
            .scalar()
        )
        if q4(total) != Decimal("0"):
            raise AppError(
                409,
                "WAREHOUSE_HAS_STOCK",
                "仓库仍有库存，不能停用，请先清零",
            )

    for field, value in changes.items():
        setattr(warehouse, field, value)

    action = "UPDATE"
    write_audit(
        db,
        action=action,
        entity_type="warehouse",
        entity_id=warehouse.id,
        entity_no=warehouse.code,
        summary=f"更新仓库 {warehouse.name}",
        detail={"fields": list(changes.keys())},
        user=actor,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "WAREHOUSE_CODE_EXISTS", "仓库编码已存在")
    db.refresh(warehouse)
    _decorate(db, [warehouse])
    return warehouse


def delete_warehouse(db: Session, warehouse_id: int, actor: User) -> None:
    warehouse = get_warehouse(db, warehouse_id)
    total_count = db.query(Warehouse).count()
    if total_count <= 1:
        raise AppError(409, "LAST_WAREHOUSE", "必须至少保留一个仓库")
    if warehouse.is_active:
        other_active = (
            db.query(Warehouse)
            .filter(Warehouse.is_active.is_(True), Warehouse.id != warehouse.id)
            .count()
        )
        if other_active == 0:
            raise AppError(409, "LAST_WAREHOUSE", "必须至少保留一个启用的仓库")

    total = (
        db.query(func.coalesce(func.sum(InventoryBalance.quantity), 0))
        .filter(InventoryBalance.warehouse_id == warehouse.id)
        .scalar()
    )
    if q4(total) != Decimal("0"):
        raise AppError(409, "WAREHOUSE_HAS_STOCK", "仓库仍有库存，不能删除")

    referenced = (
        db.query(InboundOrder.id)
        .filter(InboundOrder.warehouse_id == warehouse.id)
        .first()
        or db.query(OutboundOrder.id)
        .filter(OutboundOrder.warehouse_id == warehouse.id)
        .first()
        or db.query(TransferOrder.id)
        .filter(
            or_(
                TransferOrder.from_warehouse_id == warehouse.id,
                TransferOrder.to_warehouse_id == warehouse.id,
            )
        )
        .first()
        or db.query(Stocktake.id)
        .filter(Stocktake.warehouse_id == warehouse.id)
        .first()
    )
    if referenced:
        raise AppError(409, "WAREHOUSE_IN_USE", "仓库已被单据引用，不能删除，只能停用")

    db.query(InventoryBalance).filter(
        InventoryBalance.warehouse_id == warehouse.id
    ).delete()
    write_audit(
        db,
        action="DELETE",
        entity_type="warehouse",
        entity_id=warehouse.id,
        entity_no=warehouse.code,
        summary=f"删除仓库 {warehouse.name}",
        user=actor,
    )
    db.delete(warehouse)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "WAREHOUSE_IN_USE", "仓库已被引用，不能删除")
