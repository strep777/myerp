from __future__ import annotations

import threading
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.database import q4
from app.core.dates import date_range
from app.core.errors import AppError
from app.core.numbering import adjustment_no
from app.modules.inventory.models import InventoryBalance, InventoryLedger
from app.modules.inventory.schemas import AdjustmentCreate
from app.modules.products.models import Product
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse


# SQLite allows a single writer. All stock mutations run under this process-wide lock,
# and the lock is held until the caller commits, so two confirmations cannot interleave.
stock_lock = threading.RLock()


def _balance_out(balance: InventoryBalance, product: Product, warehouse: Warehouse) -> dict:
    quantity = q4(balance.quantity)
    avg_cost = q4(balance.avg_cost)
    safety = q4(product.safety_stock)
    return {
        "product_id": product.id,
        "sku": product.sku,
        "product_name": product.name,
        "unit": product.unit,
        "category": product.category or "",
        "warehouse_id": warehouse.id,
        "warehouse_name": warehouse.name,
        "quantity": float(quantity),
        "avg_cost": float(avg_cost),
        "stock_value": float(q4(quantity * avg_cost)),
        "safety_stock": float(safety),
        "is_low": bool(safety > 0 and quantity <= safety),
        "updated_at": balance.updated_at,
    }


def list_balances(
    db: Session,
    warehouse_id: Optional[int],
    q: Optional[str],
    category: Optional[str],
    low_stock: Optional[bool],
    include_zero: bool,
    page: int,
    page_size: int,
) -> dict:
    query = (
        db.query(InventoryBalance, Product, Warehouse)
        .join(Product, Product.id == InventoryBalance.product_id)
        .join(Warehouse, Warehouse.id == InventoryBalance.warehouse_id)
    )
    if warehouse_id is not None:
        query = query.filter(InventoryBalance.warehouse_id == warehouse_id)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(Product.sku.ilike(term), Product.name.ilike(term)))
    if category:
        query = query.filter(Product.category == category.strip())
    if low_stock:
        query = query.filter(
            Product.safety_stock > 0,
            InventoryBalance.quantity <= Product.safety_stock,
        )
    if not include_zero:
        query = query.filter(InventoryBalance.quantity > 0)
    query = query.order_by(Product.sku.asc(), Warehouse.code.asc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    items = [_balance_out(balance, product, warehouse) for balance, product, warehouse in rows]
    from app.core.pagination import page_payload

    return page_payload(items, total, page, page_size)


def get_balance(db: Session, product_id: int, warehouse_id: int) -> Optional[InventoryBalance]:
    return (
        db.query(InventoryBalance)
        .filter(
            InventoryBalance.product_id == product_id,
            InventoryBalance.warehouse_id == warehouse_id,
        )
        .first()
    )


def get_or_create_balance(
    db: Session, product_id: int, warehouse_id: int
) -> InventoryBalance:
    balance = get_balance(db, product_id, warehouse_id)
    if balance is None:
        balance = InventoryBalance(
            product_id=product_id,
            warehouse_id=warehouse_id,
            quantity=Decimal("0"),
            avg_cost=Decimal("0"),
        )
        db.add(balance)
        db.flush()
    return balance


def apply_movement(
    db: Session,
    *,
    product_id: int,
    warehouse_id: int,
    change_qty: Decimal,
    movement_type: str,
    ref_type: str,
    ref_id: Optional[int],
    ref_no: str,
    unit_cost: Optional[Decimal] = None,
    remark: str = "",
    actor_id: Optional[int] = None,
    balance: Optional[InventoryBalance] = None,
    product: Optional[Product] = None,
    flush: bool = True,
) -> Tuple[InventoryBalance, InventoryLedger]:
    """Mutate one balance and append the immutable ledger row. Caller commits.

    ``balance``/``product`` may be supplied by bulk confirmation paths so a
    200-line order does not issue two extra SELECTs per line. ``flush=False``
    lets the caller flush all ledger rows in one round trip.
    """
    change = q4(change_qty)
    if change == 0:
        raise AppError(400, "ZERO_MOVEMENT", "库存变动数量不能为 0")
    if balance is None:
        balance = get_or_create_balance(db, product_id, warehouse_id)
    old_qty = q4(balance.quantity)
    old_cost = q4(balance.avg_cost)
    new_qty = q4(old_qty + change)
    if new_qty < 0:
        if product is None:
            product = db.get(Product, product_id)
        warehouse = db.get(Warehouse, warehouse_id)
        raise AppError(
            409,
            "INSUFFICIENT_STOCK",
            "库存不足，无法完成操作",
            fields={
                "lines": [
                    {
                        "product_id": product_id,
                        "sku": product.sku if product else "",
                        "warehouse_id": warehouse_id,
                        "warehouse_name": warehouse.name if warehouse else "",
                        "requested": float(-change),
                        "available": float(old_qty),
                    }
                ]
            },
        )

    effective_cost = q4(unit_cost) if unit_cost is not None else old_cost
    if change > 0:
        if new_qty > 0:
            new_cost = q4(
                (old_qty * old_cost + change * effective_cost) / new_qty
            )
        else:
            new_cost = old_cost
    else:
        new_cost = old_cost

    balance.quantity = new_qty
    balance.avg_cost = new_cost
    ledger = InventoryLedger(
        product_id=product_id,
        warehouse_id=warehouse_id,
        movement_type=movement_type,
        change_qty=change,
        unit_cost=effective_cost,
        balance_after=new_qty,
        ref_type=ref_type,
        ref_id=ref_id,
        ref_no=ref_no,
        remark=remark[:240],
        created_by=actor_id,
    )
    db.add(ledger)
    if flush:
        db.flush()
    return balance, ledger


def _movement_user_names(db: Session, created_by_ids: List[Optional[int]]) -> Dict[int, str]:
    ids = sorted({item for item in created_by_ids if item})
    if not ids:
        return {}
    rows = db.query(User.id, User.display_name).filter(User.id.in_(ids)).all()
    return {row[0]: row[1] for row in rows}


def list_ledger(
    db: Session,
    product_id: Optional[int],
    warehouse_id: Optional[int],
    movement_type: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    ref_no: Optional[str],
    page: int,
    page_size: int,
) -> dict:
    filters = []
    if product_id is not None:
        filters.append(InventoryLedger.product_id == product_id)
    if warehouse_id is not None:
        filters.append(InventoryLedger.warehouse_id == warehouse_id)
    if movement_type:
        filters.append(InventoryLedger.movement_type == movement_type)
    if ref_no:
        filters.append(InventoryLedger.ref_no.ilike(f"%{ref_no.strip()}%"))
    start, end = date_range(date_from, date_to)
    if start:
        filters.append(InventoryLedger.created_at >= start)
    if end:
        filters.append(InventoryLedger.created_at < end)

    # Count only the ledger table; the joins are needed only to decorate the 20 output rows.
    total = (
        db.query(func.count(InventoryLedger.id))
        .filter(*filters)
        .scalar()
        or 0
    )
    query = (
        db.query(InventoryLedger, Product, Warehouse)
        .join(Product, Product.id == InventoryLedger.product_id)
        .join(Warehouse, Warehouse.id == InventoryLedger.warehouse_id)
        .filter(*filters)
        .order_by(InventoryLedger.created_at.desc(), InventoryLedger.id.desc())
    )
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    names = _movement_user_names(db, [row[0].created_by for row in rows])
    items = []
    for ledger, product, warehouse in rows:
        items.append(
            {
                "id": ledger.id,
                "product_id": product.id,
                "sku": product.sku,
                "product_name": product.name,
                "warehouse_id": warehouse.id,
                "warehouse_name": warehouse.name,
                "movement_type": ledger.movement_type,
                "change_qty": float(q4(ledger.change_qty)),
                "unit_cost": float(q4(ledger.unit_cost)),
                "balance_after": float(q4(ledger.balance_after)),
                "ref_type": ledger.ref_type,
                "ref_id": ledger.ref_id,
                "ref_no": ledger.ref_no,
                "remark": ledger.remark,
                "created_by_name": names.get(ledger.created_by, "系统"),
                "created_at": ledger.created_at,
            }
        )
    from app.core.pagination import page_payload

    return page_payload(items, total, page, page_size)


def overview(db: Session, warehouse_id: Optional[int]) -> dict:
    query = db.query(
        func.count(func.distinct(InventoryBalance.product_id)),
        func.coalesce(func.sum(InventoryBalance.quantity), 0),
        func.coalesce(func.sum(InventoryBalance.quantity * InventoryBalance.avg_cost), 0),
    ).filter(InventoryBalance.quantity > 0)
    if warehouse_id is not None:
        query = query.filter(InventoryBalance.warehouse_id == warehouse_id)
    sku_count, total_quantity, total_value = query.one()

    low_query = (
        db.query(func.count(InventoryBalance.id))
        .join(Product, Product.id == InventoryBalance.product_id)
        .filter(
            Product.safety_stock > 0,
            InventoryBalance.quantity <= Product.safety_stock,
        )
    )
    if warehouse_id is not None:
        low_query = low_query.filter(InventoryBalance.warehouse_id == warehouse_id)
    low_stock_count = low_query.scalar() or 0

    warehouse_query = db.query(Warehouse).filter(Warehouse.is_active.is_(True))
    if warehouse_id is not None:
        warehouse_query = warehouse_query.filter(Warehouse.id == warehouse_id)
    return {
        "sku_count": int(sku_count or 0),
        "total_quantity": float(q4(total_quantity)),
        "total_value": float(q4(total_value)),
        "low_stock_count": int(low_stock_count),
        "warehouse_count": warehouse_query.count(),
    }


def adjust_stock(
    db: Session, payload: AdjustmentCreate, actor: User
) -> dict:
    product = db.get(Product, payload.product_id)
    if product is None:
        raise AppError(404, "PRODUCT_NOT_FOUND", "商品不存在")
    if not product.is_active:
        raise AppError(409, "PRODUCT_INACTIVE", "商品已停用，不能调整库存")
    warehouse = db.get(Warehouse, payload.warehouse_id)
    if warehouse is None:
        raise AppError(404, "WAREHOUSE_NOT_FOUND", "仓库不存在")
    if not warehouse.is_active:
        raise AppError(409, "WAREHOUSE_INACTIVE", "仓库已停用，不能调整库存")

    with stock_lock:
        try:
            balance, ledger = apply_movement(
                db,
                product_id=product.id,
                warehouse_id=warehouse.id,
                change_qty=payload.quantity_change,
                movement_type="ADJUSTMENT",
                ref_type="ADJUST",
                ref_id=None,
                ref_no="",
                unit_cost=None,
                remark=payload.reason,
                actor_id=actor.id,
            )
            ledger.ref_no = adjustment_no(ledger.id)
            ledger.ref_id = ledger.id
            write_audit(
                db,
                action="ADJUST",
                entity_type="inventory",
                entity_id=ledger.id,
                entity_no=ledger.ref_no,
                summary=f"库存调整 {product.sku} {payload.quantity_change}",
                detail={
                    "product_id": product.id,
                    "warehouse_id": warehouse.id,
                    "quantity_change": float(payload.quantity_change),
                    "reason": payload.reason,
                },
                user=actor,
            )
            db.commit()
        except Exception:
            db.rollback()
            raise

    return {
        "product_id": product.id,
        "sku": product.sku,
        "product_name": product.name,
        "warehouse_id": warehouse.id,
        "warehouse_name": warehouse.name,
        "quantity": float(q4(balance.quantity)),
        "avg_cost": float(q4(balance.avg_cost)),
        "change_qty": float(q4(payload.quantity_change)),
        "ledger_id": ledger.id,
    }
