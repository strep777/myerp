from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.database import q4, utcnow
from app.core.dates import date_range
from app.core.errors import AppError
from app.core.numbering import next_document_no
from app.core.pagination import page_payload, paginate
from app.modules.inventory import service as inventory_service
from app.modules.inventory.models import InventoryBalance
from app.modules.products.models import Product
from app.modules.transfers.models import TransferLine, TransferOrder
from app.modules.transfers.schemas import TransferCreate
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse


def _get_order(db: Session, order_id: int) -> TransferOrder:
    order = db.get(TransferOrder, order_id)
    if order is None:
        raise AppError(404, "TRANSFER_NOT_FOUND", "调拨单不存在")
    return order


def _validate_warehouses(db: Session, from_id: int, to_id: int) -> None:
    if from_id == to_id:
        raise AppError(400, "SAME_WAREHOUSE", "调出仓库和调入仓库不能相同")
    for warehouse_id in (from_id, to_id):
        warehouse = db.get(Warehouse, warehouse_id)
        if warehouse is None:
            raise AppError(404, "WAREHOUSE_NOT_FOUND", "仓库不存在")
        if not warehouse.is_active:
            raise AppError(409, "WAREHOUSE_INACTIVE", "仓库已停用，不能创建单据")


def _validate_products(db: Session, lines) -> None:
    ids = [line.product_id for line in lines]
    if len(ids) != len(set(ids)):
        raise AppError(400, "DUPLICATE_PRODUCT", "同一商品不能重复添加，请合并数量")
    products = db.query(Product).filter(Product.id.in_(ids)).all()
    if len(products) != len(set(ids)):
        raise AppError(400, "PRODUCT_NOT_FOUND", "有商品不存在")
    inactive = [p.sku for p in products if not p.is_active]
    if inactive:
        raise AppError(
            409,
            "PRODUCT_INACTIVE",
            f"商品已停用，不能创建单据：{', '.join(inactive)}",
        )


def _apply_lines(db: Session, order: TransferOrder, payload: TransferCreate) -> None:
    order.lines.clear()
    db.flush()
    total = Decimal("0")
    for line in payload.lines:
        quantity = q4(line.quantity)
        order.lines.append(
            TransferLine(
                product_id=line.product_id,
                quantity=quantity,
                remark=line.remark,
            )
        )
        total += quantity
    order.total_quantity = q4(total)


def _detail(db: Session, order: TransferOrder) -> dict:
    warehouses = {
        warehouse.id: warehouse
        for warehouse in db.query(Warehouse)
        .filter(Warehouse.id.in_([order.from_warehouse_id, order.to_warehouse_id]))
        .all()
    }
    user_ids = {order.created_by, order.confirmed_by}
    users = {
        user.id: user.display_name
        for user in db.query(User).filter(User.id.in_([i for i in user_ids if i])).all()
    }
    product_ids = [line.product_id for line in order.lines]
    products = {
        product.id: product
        for product in db.query(Product).filter(Product.id.in_(product_ids)).all()
    } if product_ids else {}
    lines = []
    for line in order.lines:
        product = products.get(line.product_id)
        lines.append(
            {
                "id": line.id,
                "product_id": line.product_id,
                "sku": product.sku if product else "",
                "product_name": product.name if product else "",
                "unit": product.unit if product else "",
                "quantity": float(q4(line.quantity)),
                "remark": line.remark,
            }
        )
    return {
        "id": order.id,
        "order_no": order.order_no,
        "status": order.status,
        "from_warehouse_id": order.from_warehouse_id,
        "from_warehouse_name": warehouses.get(order.from_warehouse_id).name
        if warehouses.get(order.from_warehouse_id)
        else "",
        "to_warehouse_id": order.to_warehouse_id,
        "to_warehouse_name": warehouses.get(order.to_warehouse_id).name
        if warehouses.get(order.to_warehouse_id)
        else "",
        "remark": order.remark,
        "total_quantity": float(q4(order.total_quantity)),
        "created_by": order.created_by,
        "created_by_name": users.get(order.created_by, ""),
        "confirmed_by": order.confirmed_by,
        "confirmed_by_name": users.get(order.confirmed_by) if order.confirmed_by else None,
        "confirmed_at": order.confirmed_at,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "lines": lines,
    }


def list_orders(
    db: Session,
    status: Optional[str],
    from_warehouse_id: Optional[int],
    to_warehouse_id: Optional[int],
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    page: int,
    page_size: int,
) -> dict:
    query = db.query(TransferOrder)
    if status:
        query = query.filter(TransferOrder.status == status)
    if from_warehouse_id is not None:
        query = query.filter(TransferOrder.from_warehouse_id == from_warehouse_id)
    if to_warehouse_id is not None:
        query = query.filter(TransferOrder.to_warehouse_id == to_warehouse_id)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                TransferOrder.order_no.ilike(term),
                TransferOrder.remark.ilike(term),
            )
        )
    start, end = date_range(date_from, date_to)
    if start:
        query = query.filter(TransferOrder.created_at >= start)
    if end:
        query = query.filter(TransferOrder.created_at < end)
    query = query.order_by(TransferOrder.created_at.desc(), TransferOrder.id.desc())
    items, total = paginate(query, page, page_size)

    warehouse_ids = set()
    for item in items:
        warehouse_ids.add(item.from_warehouse_id)
        warehouse_ids.add(item.to_warehouse_id)
    warehouses = {
        w.id: w.name for w in db.query(Warehouse).filter(Warehouse.id.in_(warehouse_ids)).all()
    } if warehouse_ids else {}
    user_ids = {item.created_by for item in items}
    users = {
        u.id: u.display_name for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    counts = dict(
        db.query(TransferLine.order_id, func.count(TransferLine.id))
        .filter(TransferLine.order_id.in_([item.id for item in items]))
        .group_by(TransferLine.order_id)
        .all()
    ) if items else {}

    result = [
        {
            "id": item.id,
            "order_no": item.order_no,
            "status": item.status,
            "from_warehouse_id": item.from_warehouse_id,
            "from_warehouse_name": warehouses.get(item.from_warehouse_id, ""),
            "to_warehouse_id": item.to_warehouse_id,
            "to_warehouse_name": warehouses.get(item.to_warehouse_id, ""),
            "total_quantity": float(q4(item.total_quantity)),
            "line_count": counts.get(item.id, 0),
            "created_by_name": users.get(item.created_by, ""),
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        for item in items
    ]
    return page_payload(result, total, page, page_size)


def create_order(db: Session, payload: TransferCreate, actor: User) -> dict:
    _validate_warehouses(db, payload.from_warehouse_id, payload.to_warehouse_id)
    _validate_products(db, payload.lines)
    order = TransferOrder(
        order_no=next_document_no(db, TransferOrder, "TRF"),
        from_warehouse_id=payload.from_warehouse_id,
        to_warehouse_id=payload.to_warehouse_id,
        remark=payload.remark,
        status="DRAFT",
        created_by=actor.id,
    )
    _apply_lines(db, order, payload)
    db.add(order)
    try:
        db.flush()
        write_audit(
            db,
            action="CREATE",
            entity_type="transfer_order",
            entity_id=order.id,
            entity_no=order.order_no,
            summary=f"创建调拨单 {order.order_no}",
            detail={"lines": len(order.lines)},
            user=actor,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "ORDER_NO_EXISTS", "单号冲突，请重试")
    db.refresh(order)
    return _detail(db, order)


def update_order(
    db: Session, order_id: int, payload: TransferCreate, actor: User
) -> dict:
    order = _get_order(db, order_id)
    if order.status != "DRAFT":
        raise AppError(409, "ORDER_NOT_EDITABLE", "只有草稿单可以编辑")
    _validate_warehouses(db, payload.from_warehouse_id, payload.to_warehouse_id)
    _validate_products(db, payload.lines)

    order.from_warehouse_id = payload.from_warehouse_id
    order.to_warehouse_id = payload.to_warehouse_id
    order.remark = payload.remark
    _apply_lines(db, order, payload)
    write_audit(
        db,
        action="UPDATE",
        entity_type="transfer_order",
        entity_id=order.id,
        entity_no=order.order_no,
        summary=f"更新调拨单 {order.order_no}",
        user=actor,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "ORDER_CONFLICT", "单据更新冲突")
    db.refresh(order)
    return _detail(db, order)


def confirm_order(db: Session, order_id: int, actor: User) -> dict:
    with inventory_service.stock_lock:
        order = _get_order(db, order_id)
        if order.status != "DRAFT":
            raise AppError(409, "ORDER_NOT_DRAFT", "只有草稿单可以确认")
        if not order.lines:
            raise AppError(409, "EMPTY_ORDER", "单据没有明细，不能确认")
        product_ids = [line.product_id for line in order.lines]
        products = {
            product.id: product
            for product in db.query(Product).filter(Product.id.in_(product_ids)).all()
        }
        balances = {
            balance.product_id: balance
            for balance in db.query(InventoryBalance)
            .filter(
                InventoryBalance.warehouse_id == order.from_warehouse_id,
                InventoryBalance.product_id.in_(product_ids),
            )
            .all()
        }
        shortages = []
        for line in order.lines:
            available = q4(balances[line.product_id].quantity) if line.product_id in balances else Decimal("0")
            requested = q4(line.quantity)
            if requested > available:
                product = products.get(line.product_id)
                shortages.append(
                    {
                        "product_id": line.product_id,
                        "sku": product.sku if product else "",
                        "product_name": product.name if product else "",
                        "requested": float(requested),
                        "available": float(available),
                    }
                )
        if shortages:
            raise AppError(
                409,
                "INSUFFICIENT_STOCK",
                "源仓库库存不足，无法确认调拨单",
                fields={"lines": shortages},
            )

        try:
            for line in order.lines:
                product = products.get(line.product_id)
                if product is None or not product.is_active:
                    raise AppError(409, "PRODUCT_INACTIVE", "单据包含已停用商品")
                source_balance = balances.get(line.product_id)
                source_cost = q4(source_balance.avg_cost) if source_balance else Decimal("0")
                inventory_service.apply_movement(
                    db,
                    product_id=line.product_id,
                    warehouse_id=order.from_warehouse_id,
                    change_qty=-q4(line.quantity),
                    movement_type="TRANSFER_OUT",
                    ref_type="TRANSFER",
                    ref_id=order.id,
                    ref_no=order.order_no,
                    unit_cost=None,
                    remark=line.remark,
                    actor_id=actor.id,
                )
                inventory_service.apply_movement(
                    db,
                    product_id=line.product_id,
                    warehouse_id=order.to_warehouse_id,
                    change_qty=q4(line.quantity),
                    movement_type="TRANSFER_IN",
                    ref_type="TRANSFER",
                    ref_id=order.id,
                    ref_no=order.order_no,
                    unit_cost=source_cost,
                    remark=line.remark,
                    actor_id=actor.id,
                )
            order.status = "CONFIRMED"
            order.confirmed_by = actor.id
            order.confirmed_at = utcnow()
            write_audit(
                db,
                action="CONFIRM",
                entity_type="transfer_order",
                entity_id=order.id,
                entity_no=order.order_no,
                summary=f"确认调拨单 {order.order_no}",
                user=actor,
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
    db.refresh(order)
    return _detail(db, order)


def cancel_order(db: Session, order_id: int, actor: User) -> dict:
    order = _get_order(db, order_id)
    if order.status != "DRAFT":
        raise AppError(409, "ORDER_NOT_CANCELLABLE", "只有草稿单可以取消")
    order.status = "CANCELLED"
    write_audit(
        db,
        action="CANCEL",
        entity_type="transfer_order",
        entity_id=order.id,
        entity_no=order.order_no,
        summary=f"取消调拨单 {order.order_no}",
        user=actor,
    )
    db.commit()
    db.refresh(order)
    return _detail(db, order)


def delete_order(db: Session, order_id: int, actor: User) -> None:
    order = _get_order(db, order_id)
    if order.status != "DRAFT":
        raise AppError(409, "ORDER_NOT_DELETABLE", "只有草稿单可以删除")
    write_audit(
        db,
        action="DELETE",
        entity_type="transfer_order",
        entity_id=order.id,
        entity_no=order.order_no,
        summary=f"删除调拨单 {order.order_no}",
        user=actor,
    )
    db.delete(order)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "ORDER_IN_USE", "单据已被引用，不能删除")
