from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import case, func, or_
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
from app.modules.stocktakes.models import Stocktake, StocktakeLine
from app.modules.stocktakes.schemas import StocktakeCreate, StocktakeLinesUpdate
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse


def _get_stocktake(db: Session, stocktake_id: int) -> Stocktake:
    stocktake = db.get(Stocktake, stocktake_id)
    if stocktake is None:
        raise AppError(404, "STOCKTAKE_NOT_FOUND", "盘点单不存在")
    return stocktake


def _summary_counts(db: Session, ids) -> dict:
    if not ids:
        return {}
    rows = (
        db.query(
            StocktakeLine.stocktake_id,
            func.count(StocktakeLine.id),
            func.sum(
                case(
                    (StocktakeLine.difference_quantity != 0, 1),
                    else_=0,
                )
            ),
            func.sum(StocktakeLine.difference_quantity),
        )
        .filter(StocktakeLine.stocktake_id.in_(ids))
        .group_by(StocktakeLine.stocktake_id)
        .all()
    )
    return {
        row[0]: {
            "line_count": int(row[1] or 0),
            "difference_line_count": int(row[2] or 0),
            "total_difference_quantity": q4(row[3] or 0),
        }
        for row in rows
    }


def _detail(db: Session, stocktake: Stocktake) -> dict:
    warehouse = db.get(Warehouse, stocktake.warehouse_id)
    user_ids = {stocktake.created_by, stocktake.completed_by}
    users = {
        user.id: user.display_name
        for user in db.query(User).filter(User.id.in_([i for i in user_ids if i])).all()
    }
    product_ids = [line.product_id for line in stocktake.lines]
    products = {
        product.id: product
        for product in db.query(Product).filter(Product.id.in_(product_ids)).all()
    } if product_ids else {}
    lines = []
    difference_count = 0
    total_difference = Decimal("0")
    for line in stocktake.lines:
        product = products.get(line.product_id)
        difference = q4(line.counted_quantity) - q4(line.book_quantity)
        if difference != 0:
            difference_count += 1
        total_difference += difference
        lines.append(
            {
                "id": line.id,
                "product_id": line.product_id,
                "sku": product.sku if product else "",
                "product_name": product.name if product else "",
                "unit": product.unit if product else "",
                "book_quantity": float(q4(line.book_quantity)),
                "counted_quantity": float(q4(line.counted_quantity)),
                "difference_quantity": float(difference),
                "remark": line.remark,
            }
        )
    return {
        "id": stocktake.id,
        "stocktake_no": stocktake.stocktake_no,
        "warehouse_id": stocktake.warehouse_id,
        "warehouse_name": warehouse.name if warehouse else "",
        "status": stocktake.status,
        "remark": stocktake.remark,
        "created_by": stocktake.created_by,
        "created_by_name": users.get(stocktake.created_by, ""),
        "completed_by": stocktake.completed_by,
        "completed_by_name": users.get(stocktake.completed_by)
        if stocktake.completed_by
        else None,
        "completed_at": stocktake.completed_at,
        "created_at": stocktake.created_at,
        "updated_at": stocktake.updated_at,
        "line_count": len(lines),
        "difference_line_count": difference_count,
        "total_difference_quantity": float(q4(total_difference)),
        "lines": lines,
    }


def list_stocktakes(
    db: Session,
    status: Optional[str],
    warehouse_id: Optional[int],
    q: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    page: int,
    page_size: int,
) -> dict:
    query = db.query(Stocktake)
    if status:
        query = query.filter(Stocktake.status == status)
    if warehouse_id is not None:
        query = query.filter(Stocktake.warehouse_id == warehouse_id)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Stocktake.stocktake_no.ilike(term),
                Stocktake.remark.ilike(term),
            )
        )
    start, end = date_range(date_from, date_to)
    if start:
        query = query.filter(Stocktake.created_at >= start)
    if end:
        query = query.filter(Stocktake.created_at < end)
    query = query.order_by(Stocktake.created_at.desc(), Stocktake.id.desc())
    items, total = paginate(query, page, page_size)

    warehouse_ids = {item.warehouse_id for item in items}
    warehouses = {
        w.id: w.name for w in db.query(Warehouse).filter(Warehouse.id.in_(warehouse_ids)).all()
    } if warehouse_ids else {}
    user_ids = {item.created_by for item in items}
    users = {
        u.id: u.display_name for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    counts = _summary_counts(db, [item.id for item in items])
    result = []
    for item in items:
        count = counts.get(item.id, {})
        result.append(
            {
                "id": item.id,
                "stocktake_no": item.stocktake_no,
                "warehouse_id": item.warehouse_id,
                "warehouse_name": warehouses.get(item.warehouse_id, ""),
                "status": item.status,
                "line_count": count.get("line_count", 0),
                "difference_line_count": count.get("difference_line_count", 0),
                "total_difference_quantity": float(
                    q4(count.get("total_difference_quantity", 0))
                ),
                "created_by_name": users.get(item.created_by, ""),
                "completed_at": item.completed_at,
                "created_at": item.created_at,
            }
        )
    return page_payload(result, total, page, page_size)


def create_stocktake(db: Session, payload: StocktakeCreate, actor: User) -> dict:
    warehouse = db.get(Warehouse, payload.warehouse_id)
    if warehouse is None:
        raise AppError(404, "WAREHOUSE_NOT_FOUND", "仓库不存在")
    if not warehouse.is_active:
        raise AppError(409, "WAREHOUSE_INACTIVE", "仓库已停用，不能创建盘点")
    ongoing = (
        db.query(Stocktake.id)
        .filter(
            Stocktake.warehouse_id == payload.warehouse_id,
            Stocktake.status.in_(["DRAFT", "COUNTING"]),
        )
        .first()
    )
    if ongoing:
        raise AppError(
            409,
            "ONGOING_STOCKTAKE",
            "该仓库已有进行中的盘点，请先完成或取消",
        )
    products = (
        db.query(Product)
        .filter(Product.is_active.is_(True))
        .order_by(Product.sku.asc())
        .all()
    )
    if not products:
        raise AppError(409, "EMPTY_STOCKTAKE", "当前没有启用商品，无法盘点")

    balances = {
        balance.product_id: q4(balance.quantity)
        for balance in db.query(InventoryBalance)
        .filter(InventoryBalance.warehouse_id == payload.warehouse_id)
        .all()
    }
    stocktake = Stocktake(
        stocktake_no=next_document_no(db, Stocktake, "STK"),
        warehouse_id=payload.warehouse_id,
        status="DRAFT",
        remark=payload.remark,
        created_by=actor.id,
    )
    for product in products:
        book = q4(balances.get(product.id, 0))
        stocktake.lines.append(
            StocktakeLine(
                product_id=product.id,
                book_quantity=book,
                counted_quantity=book,
                difference_quantity=Decimal("0"),
            )
        )
    db.add(stocktake)
    try:
        db.flush()
        write_audit(
            db,
            action="CREATE",
            entity_type="stocktake",
            entity_id=stocktake.id,
            entity_no=stocktake.stocktake_no,
            summary=f"创建盘点单 {stocktake.stocktake_no}",
            detail={"line_count": len(stocktake.lines)},
            user=actor,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "STOCKTAKE_CONFLICT", "盘点单创建冲突，请重试")
    db.refresh(stocktake)
    return _detail(db, stocktake)


def update_lines(
    db: Session, stocktake_id: int, payload: StocktakeLinesUpdate, actor: User
) -> dict:
    stocktake = _get_stocktake(db, stocktake_id)
    if stocktake.status not in ("DRAFT", "COUNTING"):
        raise AppError(409, "STOCKTAKE_NOT_EDITABLE", "该盘点单不能修改实盘数")
    line_map = {line.id: line for line in stocktake.lines}
    for update in payload.lines:
        line = line_map.get(update.line_id)
        if line is None:
            raise AppError(
                400,
                "LINE_NOT_FOUND",
                f"盘点明细 {update.line_id} 不属于该盘点单",
            )
        counted = q4(update.counted_quantity)
        line.counted_quantity = counted
        line.difference_quantity = counted - q4(line.book_quantity)
        line.remark = update.remark
    stocktake.status = "COUNTING"
    write_audit(
        db,
        action="UPDATE",
        entity_type="stocktake",
        entity_id=stocktake.id,
        entity_no=stocktake.stocktake_no,
        summary=f"保存盘点实盘数 {stocktake.stocktake_no}",
        detail={"line_count": len(payload.lines)},
        user=actor,
    )
    db.commit()
    db.refresh(stocktake)
    return _detail(db, stocktake)


def complete_stocktake(db: Session, stocktake_id: int, actor: User) -> dict:
    with inventory_service.stock_lock:
        stocktake = _get_stocktake(db, stocktake_id)
        if stocktake.status not in ("DRAFT", "COUNTING"):
            raise AppError(409, "STOCKTAKE_NOT_COMPLETABLE", "该盘点单不能完成")
        if not stocktake.lines:
            raise AppError(409, "EMPTY_STOCKTAKE", "盘点单没有明细")

        balances = {
            balance.product_id: balance
            for balance in db.query(InventoryBalance)
            .filter(InventoryBalance.warehouse_id == stocktake.warehouse_id)
            .all()
        }
        stale = []
        for line in stocktake.lines:
            balance = balances.get(line.product_id)
            current = q4(balance.quantity) if balance else Decimal("0")
            if current != q4(line.book_quantity):
                product = db.get(Product, line.product_id)
                stale.append(
                    {
                        "product_id": line.product_id,
                        "sku": product.sku if product else "",
                        "product_name": product.name if product else "",
                        "book_quantity": float(q4(line.book_quantity)),
                        "current_quantity": float(current),
                    }
                )
        if stale:
            raise AppError(
                409,
                "STOCKTAKE_STALE",
                "盘点期间该仓库库存已发生变化，请取消后重新盘点",
                fields={"lines": stale},
            )

        try:
            difference_lines = 0
            for line in stocktake.lines:
                difference = q4(line.counted_quantity) - q4(line.book_quantity)
                if difference == 0:
                    continue
                difference_lines += 1
                movement_type = (
                    "STOCKTAKE_GAIN" if difference > 0 else "STOCKTAKE_LOSS"
                )
                inventory_service.apply_movement(
                    db,
                    product_id=line.product_id,
                    warehouse_id=stocktake.warehouse_id,
                    change_qty=difference,
                    movement_type=movement_type,
                    ref_type="STOCKTAKE",
                    ref_id=stocktake.id,
                    ref_no=stocktake.stocktake_no,
                    unit_cost=None,
                    remark=line.remark,
                    actor_id=actor.id,
                )
                line.difference_quantity = difference
            stocktake.status = "COMPLETED"
            stocktake.completed_by = actor.id
            stocktake.completed_at = utcnow()
            write_audit(
                db,
                action="COMPLETE",
                entity_type="stocktake",
                entity_id=stocktake.id,
                entity_no=stocktake.stocktake_no,
                summary=f"完成盘点单 {stocktake.stocktake_no}",
                detail={"difference_lines": difference_lines},
                user=actor,
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
    db.refresh(stocktake)
    return _detail(db, stocktake)


def cancel_stocktake(db: Session, stocktake_id: int, actor: User) -> dict:
    stocktake = _get_stocktake(db, stocktake_id)
    if stocktake.status not in ("DRAFT", "COUNTING"):
        raise AppError(409, "STOCKTAKE_NOT_CANCELLABLE", "该盘点单不能取消")
    stocktake.status = "CANCELLED"
    write_audit(
        db,
        action="CANCEL",
        entity_type="stocktake",
        entity_id=stocktake.id,
        entity_no=stocktake.stocktake_no,
        summary=f"取消盘点单 {stocktake.stocktake_no}",
        user=actor,
    )
    db.commit()
    db.refresh(stocktake)
    return _detail(db, stocktake)


def delete_stocktake(db: Session, stocktake_id: int, actor: User) -> None:
    stocktake = _get_stocktake(db, stocktake_id)
    if stocktake.status != "DRAFT":
        raise AppError(409, "STOCKTAKE_NOT_DELETABLE", "只有未保存实盘数的盘点可以删除")
    write_audit(
        db,
        action="DELETE",
        entity_type="stocktake",
        entity_id=stocktake.id,
        entity_no=stocktake.stocktake_no,
        summary=f"删除盘点单 {stocktake.stocktake_no}",
        user=actor,
    )
    db.delete(stocktake)
    db.commit()
