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
from app.modules.inbound.models import InboundLine
from app.modules.inventory.models import InventoryBalance, InventoryLedger
from app.modules.outbound.models import OutboundLine
from app.modules.products.models import Product
from app.modules.products.schemas import ProductCreate, ProductUpdate
from app.modules.stocktakes.models import StocktakeLine
from app.modules.transfers.models import TransferLine
from app.modules.users.models import User


def _stock_totals(db: Session, product_ids: List[int]) -> dict:
    if not product_ids:
        return {}
    rows = (
        db.query(
            InventoryBalance.product_id,
            func.coalesce(func.sum(InventoryBalance.quantity), 0),
        )
        .filter(InventoryBalance.product_id.in_(product_ids))
        .group_by(InventoryBalance.product_id)
        .all()
    )
    return {row[0]: q4(row[1]) for row in rows}


def _decorate(db: Session, products: List[Product]) -> None:
    totals = _stock_totals(db, [p.id for p in products])
    for product in products:
        quantity = totals.get(product.id, Decimal("0"))
        product.total_quantity = float(quantity)
        product.is_low_stock = bool(
            product.safety_stock is not None
            and Decimal(product.safety_stock) > 0
            and quantity <= Decimal(product.safety_stock)
        )


def list_products(
    db: Session,
    q: Optional[str],
    category: Optional[str],
    is_active: Optional[bool],
    page: int,
    page_size: int,
) -> dict:
    query = db.query(Product)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Product.sku.ilike(term),
                Product.name.ilike(term),
                Product.barcode.ilike(term),
            )
        )
    if category:
        query = query.filter(Product.category == category.strip())
    if is_active is not None:
        query = query.filter(Product.is_active == is_active)
    query = query.order_by(Product.id.desc())
    items, total = paginate(query, page, page_size)
    _decorate(db, items)
    return page_payload(items, total, page, page_size)


def list_options(db: Session, q: Optional[str], limit: int) -> List[Product]:
    query = db.query(Product).filter(Product.is_active.is_(True))
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Product.sku.ilike(term),
                Product.name.ilike(term),
                Product.barcode.ilike(term),
            )
        )
    return query.order_by(Product.sku.asc()).limit(limit).all()


def get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise AppError(404, "PRODUCT_NOT_FOUND", "商品不存在")
    return product


def _ensure_unique(db: Session, sku: Optional[str], barcode: Optional[str], exclude_id: Optional[int] = None) -> None:
    if sku:
        query = db.query(Product).filter(Product.sku == sku)
        if exclude_id:
            query = query.filter(Product.id != exclude_id)
        if query.first():
            raise AppError(
                409,
                "SKU_EXISTS",
                "商品编码已存在",
                fields={"sku": "商品编码已存在"},
            )
    if barcode:
        query = db.query(Product).filter(Product.barcode == barcode)
        if exclude_id:
            query = query.filter(Product.id != exclude_id)
        if query.first():
            raise AppError(
                409,
                "BARCODE_EXISTS",
                "条码已被其他商品使用",
                fields={"barcode": "条码已被其他商品使用"},
            )


def create_product(
    db: Session, payload: ProductCreate, actor: User, commit: bool = True
) -> Product:
    _ensure_unique(db, payload.sku, payload.barcode)
    product = Product(
        sku=payload.sku,
        name=payload.name,
        category=payload.category,
        spec=payload.spec,
        unit=payload.unit,
        barcode=payload.barcode,
        safety_stock=payload.safety_stock,
        reference_cost=payload.reference_cost,
        reference_price=payload.reference_price,
        remark=payload.remark,
        is_active=payload.is_active,
    )
    db.add(product)
    try:
        db.flush()
        write_audit(
            db,
            action="CREATE",
            entity_type="product",
            entity_id=product.id,
            entity_no=product.sku,
            summary=f"创建商品 {product.name}",
            user=actor,
        )
        if commit:
            db.commit()
        else:
            db.flush()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "PRODUCT_CONFLICT", "商品编码或条码已存在")
    if commit:
        db.refresh(product)
    product.total_quantity = 0.0
    product.is_low_stock = False
    return product


def update_product(
    db: Session,
    product_id: int,
    payload: ProductUpdate,
    actor: User,
) -> Product:
    product = get_product(db, product_id)
    changes = payload.model_dump(exclude_unset=True)
    _ensure_unique(db, changes.get("sku"), changes.get("barcode"), exclude_id=product.id)
    for field, value in changes.items():
        setattr(product, field, value)
    write_audit(
        db,
        action="UPDATE",
        entity_type="product",
        entity_id=product.id,
        entity_no=product.sku,
        summary=f"更新商品 {product.name}",
        detail={"fields": list(changes.keys())},
        user=actor,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "PRODUCT_CONFLICT", "商品编码或条码已存在")
    db.refresh(product)
    _decorate(db, [product])
    return product


def clear_stock(db: Session, product_id: int, actor: User) -> dict:
    """把商品在所有仓库的余额降为 0，逐仓库写调整流水与审计。"""
    from app.modules.inventory.schemas import AdjustmentCreate
    from app.modules.inventory.service import adjust_stock

    product = get_product(db, product_id)
    balances = (
        db.query(InventoryBalance)
        .filter(InventoryBalance.product_id == product.id)
        .all()
    )
    total = sum((Decimal(balance.quantity) for balance in balances), Decimal("0"))
    cleared = 0
    for balance in balances:
        quantity = Decimal(balance.quantity)
        if q4(quantity) == Decimal("0"):
            continue
        adjust_stock(
            db,
            AdjustmentCreate(
                product_id=product.id,
                warehouse_id=balance.warehouse_id,
                quantity_change=-quantity,
                reason="商品页面清空库存",
            ),
            actor,
        )
        cleared += 1
    if cleared:
        write_audit(
            db,
            action="CLEAR_STOCK",
            entity_type="product",
            entity_id=product.id,
            entity_no=product.sku,
            summary=f"清空商品库存 {product.name}",
            detail={"warehouses": cleared, "quantity": float(total)},
            user=actor,
        )
        db.commit()
    return {
        "product_id": product.id,
        "cleared_warehouses": cleared,
        "cleared_quantity": float(total),
    }


def delete_product(db: Session, product_id: int, actor: User) -> None:
    product = get_product(db, product_id)
    total = (
        db.query(func.coalesce(func.sum(InventoryBalance.quantity), 0))
        .filter(InventoryBalance.product_id == product.id)
        .scalar()
    )

    referenced = (
        db.query(InboundLine.id).filter(InboundLine.product_id == product.id).first()
        or db.query(OutboundLine.id).filter(OutboundLine.product_id == product.id).first()
        or db.query(TransferLine.id).filter(TransferLine.product_id == product.id).first()
        or db.query(StocktakeLine.id).filter(StocktakeLine.product_id == product.id).first()
    )
    if referenced:
        raise AppError(409, "PRODUCT_IN_USE", "商品已被历史单据引用，不能删除，只能停用")

    # 商品档案删除时，库存余额与库存流水一并清除；审计中保留删除前数量。
    db.query(InventoryLedger).filter(InventoryLedger.product_id == product.id).delete(
        synchronize_session=False
    )
    db.query(InventoryBalance).filter(InventoryBalance.product_id == product.id).delete(
        synchronize_session=False
    )
    write_audit(
        db,
        action="DELETE",
        entity_type="product",
        entity_id=product.id,
        entity_no=product.sku,
        summary=f"删除商品 {product.name}（含库存 {q4(total)}）",
        detail={"cleared_quantity": float(total)},
        user=actor,
    )
    db.delete(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "PRODUCT_IN_USE", "商品已被引用，不能删除")
