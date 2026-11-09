from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.database import q4
from app.core.dates import date_range
from app.core.errors import AppError
from app.core.numbering import next_document_no
from app.core.pagination import page_payload, paginate
from app.modules.inbound.models import InboundLine, InboundOrder
from app.modules.inbound.schemas import InboundCreate
from app.modules.inventory import service as inventory_service
from app.modules.inventory.models import InventoryBalance
from app.modules.products.models import Product
from app.modules.partners.models import Supplier
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse


def _get_order(db: Session, order_id: int) -> InboundOrder:
    order = db.get(InboundOrder, order_id)
    if order is None:
        raise AppError(404, "INBOUND_NOT_FOUND", "入库单不存在")
    return order


def _validate_warehouse(db: Session, warehouse_id: int) -> Warehouse:
    warehouse = db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise AppError(404, "WAREHOUSE_NOT_FOUND", "仓库不存在")
    if not warehouse.is_active:
        raise AppError(409, "WAREHOUSE_INACTIVE", "仓库已停用，不能创建单据")
    return warehouse


def _validate_supplier(db: Session, supplier_id: Optional[int]) -> Optional[Supplier]:
    if supplier_id is None:
        return None
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise AppError(404, "SUPPLIER_NOT_FOUND", "供应商不存在")
    if not supplier.is_active:
        raise AppError(409, "SUPPLIER_INACTIVE", "供应商已停用，不能创建单据")
    return supplier


def _validate_products(db: Session, lines) -> Dict[int, Product]:
    ids = [line.product_id for line in lines]
    if len(ids) != len(set(ids)):
        raise AppError(400, "DUPLICATE_PRODUCT", "同一商品不能重复添加，请合并数量")
    products = db.query(Product).filter(Product.id.in_(ids)).all()
    product_map = {product.id: product for product in products}
    if len(product_map) != len(set(ids)):
        raise AppError(400, "PRODUCT_NOT_FOUND", "有商品不存在")
    inactive = [p.sku for p in products if not p.is_active]
    if inactive:
        raise AppError(
            409,
            "PRODUCT_INACTIVE",
            f"商品已停用，不能创建单据：{', '.join(inactive)}",
        )
    return product_map


def _apply_lines(
    db: Session, order: InboundOrder, payload: InboundCreate, products: Dict[int, Product]
) -> None:
    order.lines.clear()
    db.flush()
    total_quantity = Decimal("0")
    total_amount = Decimal("0")
    for line in payload.lines:
        quantity = q4(line.quantity)
        unit_cost = q4(line.unit_cost)
        amount = q4(quantity * unit_cost)
        order.lines.append(
            InboundLine(
                product_id=line.product_id,
                quantity=quantity,
                unit_cost=unit_cost,
                amount=amount,
                remark=line.remark,
            )
        )
        total_quantity += quantity
        total_amount += amount
    order.total_quantity = q4(total_quantity)
    order.total_amount = q4(total_amount)


def _detail(db: Session, order: InboundOrder) -> dict:
    supplier = db.get(Supplier, order.supplier_id) if order.supplier_id else None
    warehouse = db.get(Warehouse, order.warehouse_id)
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
                "unit_cost": float(q4(line.unit_cost)),
                "amount": float(q4(line.amount)),
                "remark": line.remark,
            }
        )
    return {
        "id": order.id,
        "order_no": order.order_no,
        "status": order.status,
        "supplier_id": order.supplier_id,
        "supplier_name": supplier.name if supplier else "",
        "warehouse_id": order.warehouse_id,
        "warehouse_name": warehouse.name if warehouse else "",
        "related_no": order.related_no,
        "expected_date": order.expected_date,
        "remark": order.remark,
        "total_quantity": float(q4(order.total_quantity)),
        "total_amount": float(q4(order.total_amount)),
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
    warehouse_id: Optional[int],
    supplier_id: Optional[int],
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    page: int,
    page_size: int,
) -> dict:
    query = db.query(InboundOrder)
    if status:
        query = query.filter(InboundOrder.status == status)
    if warehouse_id is not None:
        query = query.filter(InboundOrder.warehouse_id == warehouse_id)
    if supplier_id is not None:
        query = query.filter(InboundOrder.supplier_id == supplier_id)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                InboundOrder.order_no.ilike(term),
                InboundOrder.related_no.ilike(term),
                InboundOrder.remark.ilike(term),
            )
        )
    start, end = date_range(date_from, date_to)
    if start:
        query = query.filter(InboundOrder.created_at >= start)
    if end:
        query = query.filter(InboundOrder.created_at < end)
    query = query.order_by(InboundOrder.created_at.desc(), InboundOrder.id.desc())
    items, total = paginate(query, page, page_size)

    supplier_ids = {item.supplier_id for item in items if item.supplier_id}
    warehouse_ids = {item.warehouse_id for item in items}
    user_ids = {item.created_by for item in items}
    suppliers = {
        s.id: s.name for s in db.query(Supplier).filter(Supplier.id.in_(supplier_ids)).all()
    } if supplier_ids else {}
    warehouses = {
        w.id: w.name for w in db.query(Warehouse).filter(Warehouse.id.in_(warehouse_ids)).all()
    } if warehouse_ids else {}
    users = {
        u.id: u.display_name for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    counts = dict(
        db.query(InboundLine.order_id, func.count(InboundLine.id))
        .filter(InboundLine.order_id.in_([item.id for item in items]))
        .group_by(InboundLine.order_id)
        .all()
    ) if items else {}

    result = [
        {
            "id": item.id,
            "order_no": item.order_no,
            "status": item.status,
            "supplier_id": item.supplier_id,
            "supplier_name": suppliers.get(item.supplier_id, ""),
            "warehouse_id": item.warehouse_id,
            "warehouse_name": warehouses.get(item.warehouse_id, ""),
            "related_no": item.related_no,
            "expected_date": item.expected_date,
            "total_quantity": float(q4(item.total_quantity)),
            "total_amount": float(q4(item.total_amount)),
            "line_count": counts.get(item.id, 0),
            "created_by_name": users.get(item.created_by, ""),
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        for item in items
    ]
    return page_payload(result, total, page, page_size)


def create_order(db: Session, payload: InboundCreate, actor: User) -> dict:
    _validate_warehouse(db, payload.warehouse_id)
    _validate_supplier(db, payload.supplier_id)
    products = _validate_products(db, payload.lines)
    order = InboundOrder(
        order_no=next_document_no(db, InboundOrder, "IN"),
        supplier_id=payload.supplier_id,
        warehouse_id=payload.warehouse_id,
        related_no=payload.related_no,
        expected_date=payload.expected_date,
        remark=payload.remark,
        status="DRAFT",
        created_by=actor.id,
    )
    _apply_lines(db, order, payload, products)
    db.add(order)
    try:
        db.flush()
        write_audit(
            db,
            action="CREATE",
            entity_type="inbound_order",
            entity_id=order.id,
            entity_no=order.order_no,
            summary=f"创建入库单 {order.order_no}",
            detail={"lines": len(order.lines)},
            user=actor,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "ORDER_NO_EXISTS", "单号冲突，请重试")
    db.refresh(order)
    return _detail(db, order)


def update_order(db: Session, order_id: int, payload: InboundCreate, actor: User) -> dict:
    order = _get_order(db, order_id)
    if order.status != "DRAFT":
        raise AppError(409, "ORDER_NOT_EDITABLE", "只有草稿单可以编辑")
    _validate_warehouse(db, payload.warehouse_id)
    _validate_supplier(db, payload.supplier_id)
    products = _validate_products(db, payload.lines)

    order.supplier_id = payload.supplier_id
    order.warehouse_id = payload.warehouse_id
    order.related_no = payload.related_no
    order.expected_date = payload.expected_date
    order.remark = payload.remark
    _apply_lines(db, order, payload, products)
    write_audit(
        db,
        action="UPDATE",
        entity_type="inbound_order",
        entity_id=order.id,
        entity_no=order.order_no,
        summary=f"更新入库单 {order.order_no}",
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
        try:
            product_ids = [line.product_id for line in order.lines]
            products = {
                product.id: product
                for product in db.query(Product).filter(Product.id.in_(product_ids)).all()
            }
            inactive = []
            for line in order.lines:
                product = products.get(line.product_id)
                if product is None:
                    inactive.append(f"#{line.product_id}")
                elif not product.is_active:
                    inactive.append(product.sku)
            if inactive:
                raise AppError(
                    409,
                    "PRODUCT_INACTIVE",
                    f"单据包含已停用或不存在的商品：{', '.join(inactive)}",
                )
            balances = {
                balance.product_id: balance
                for balance in db.query(InventoryBalance)
                .filter(
                    InventoryBalance.warehouse_id == order.warehouse_id,
                    InventoryBalance.product_id.in_(product_ids),
                )
                .all()
            }
            for line in order.lines:
                balance = balances.get(line.product_id)
                if balance is None:
                    balance = InventoryBalance(
                        product_id=line.product_id,
                        warehouse_id=order.warehouse_id,
                        quantity=Decimal("0"),
                        avg_cost=Decimal("0"),
                    )
                    db.add(balance)
                    balances[line.product_id] = balance
                inventory_service.apply_movement(
                    db,
                    product_id=line.product_id,
                    warehouse_id=order.warehouse_id,
                    change_qty=line.quantity,
                    movement_type="INBOUND",
                    ref_type="INBOUND",
                    ref_id=order.id,
                    ref_no=order.order_no,
                    unit_cost=line.unit_cost,
                    remark=line.remark,
                    actor_id=actor.id,
                    balance=balance,
                    product=products[line.product_id],
                    flush=False,
                )
            db.flush()
            order.status = "CONFIRMED"
            order.confirmed_by = actor.id
            from app.core.database import utcnow

            order.confirmed_at = utcnow()
            write_audit(
                db,
                action="CONFIRM",
                entity_type="inbound_order",
                entity_id=order.id,
                entity_no=order.order_no,
                summary=f"确认入库单 {order.order_no}",
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
        entity_type="inbound_order",
        entity_id=order.id,
        entity_no=order.order_no,
        summary=f"取消入库单 {order.order_no}",
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
        entity_type="inbound_order",
        entity_id=order.id,
        entity_no=order.order_no,
        summary=f"删除入库单 {order.order_no}",
        user=actor,
    )
    db.delete(order)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "ORDER_IN_USE", "单据已被引用，不能删除")
