from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from fastapi import Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import q4
from app.core.dates import business_today_date, date_range
from app.core.errors import AppError
from app.core.pagination import page_payload, paginate
from app.modules.inventory import service as inventory_service
from app.modules.inventory.models import InventoryBalance, InventoryLedger
from app.modules.products.models import Product
from app.modules.reports.schemas import FlowSummaryItem, LowStockItem, StockReportItem
from app.modules.users.models import User
from app.modules.warehouses.models import Warehouse


MAX_EXPORT_ROWS = 50000
INBOUND_TYPES = ("INBOUND", "TRANSFER_IN")
OUTBOUND_TYPES = ("OUTBOUND", "TRANSFER_OUT")
ADJUST_TYPES = ("STOCKTAKE_GAIN", "STOCKTAKE_LOSS", "ADJUSTMENT")


def _stock_query(
    db: Session,
    warehouse_id: Optional[int],
    category: Optional[str],
    q: Optional[str],
    low_only: bool,
    include_zero: bool,
):
    query = (
        db.query(InventoryBalance, Product, Warehouse)
        .join(Product, Product.id == InventoryBalance.product_id)
        .join(Warehouse, Warehouse.id == InventoryBalance.warehouse_id)
    )
    if warehouse_id is not None:
        query = query.filter(InventoryBalance.warehouse_id == warehouse_id)
    if category:
        query = query.filter(Product.category == category.strip())
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(Product.sku.ilike(term), Product.name.ilike(term)))
    if low_only:
        query = query.filter(
            Product.safety_stock > 0,
            InventoryBalance.quantity <= Product.safety_stock,
        )
    if not include_zero:
        query = query.filter(InventoryBalance.quantity > 0)
    return query.order_by(Product.sku.asc(), Warehouse.code.asc())


def _stock_item(balance: InventoryBalance, product: Product, warehouse: Warehouse) -> dict:
    quantity = q4(balance.quantity)
    avg_cost = q4(balance.avg_cost)
    safety = q4(product.safety_stock)
    shortage = q4(safety - quantity) if safety > 0 and quantity < safety else Decimal("0")
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
        "shortage": float(shortage),
        "recommended_qty": float(shortage),
        "updated_at": balance.updated_at,
    }


def stock_summary(
    db: Session,
    warehouse_id: Optional[int],
    category: Optional[str],
    q: Optional[str],
    include_zero: bool,
    page: int,
    page_size: int,
) -> dict:
    query = _stock_query(db, warehouse_id, category, q, False, include_zero)
    items, total = paginate(query, page, page_size)
    value_query = (
        db.query(func.coalesce(func.sum(InventoryBalance.quantity * InventoryBalance.avg_cost), 0))
        .join(Product, Product.id == InventoryBalance.product_id)
        .join(Warehouse, Warehouse.id == InventoryBalance.warehouse_id)
    )
    if warehouse_id is not None:
        value_query = value_query.filter(InventoryBalance.warehouse_id == warehouse_id)
    if category:
        value_query = value_query.filter(Product.category == category.strip())
    if q:
        term = f"%{q.strip()}%"
        value_query = value_query.filter(or_(Product.sku.ilike(term), Product.name.ilike(term)))
    if not include_zero:
        value_query = value_query.filter(InventoryBalance.quantity > 0)
    total_value = q4(value_query.scalar() or 0)
    rows = [_stock_item(balance, product, warehouse) for balance, product, warehouse in items]
    payload = page_payload(rows, total, page, page_size)
    payload["items"] = [StockReportItem(**row).model_dump() for row in rows]
    payload["total_value"] = float(total_value)
    return payload


def low_stock(
    db: Session,
    warehouse_id: Optional[int],
    category: Optional[str],
    q: Optional[str],
    page: int,
    page_size: int,
) -> dict:
    query = _stock_query(db, warehouse_id, category, q, True, True)
    items, total = paginate(query, page, page_size)
    rows = []
    for balance, product, warehouse in items:
        data = _stock_item(balance, product, warehouse)
        rows.append(LowStockItem(**data).model_dump())
    return page_payload(rows, total, page, page_size)


def _flow_bounds(date_from: Optional[date], date_to: Optional[date]) -> Tuple[date, date]:
    today = business_today_date()
    start_date = date_from or today.replace(day=1)
    end_date = date_to or today
    if end_date < start_date:
        raise AppError(400, "INVALID_DATE_RANGE", "结束日期不能早于开始日期")
    return start_date, end_date


def _flow_rows(
    db: Session,
    start_date: date,
    end_date: date,
    warehouse_id: Optional[int],
    category: Optional[str],
    q: Optional[str],
) -> List[dict]:
    start, end = date_range(start_date, end_date)

    opening_sub = (
        db.query(
            InventoryLedger.product_id,
            InventoryLedger.warehouse_id,
            func.max(InventoryLedger.id).label("last_id"),
        )
        .filter(InventoryLedger.created_at < start)
    )
    if warehouse_id is not None:
        opening_sub = opening_sub.filter(InventoryLedger.warehouse_id == warehouse_id)
    opening_sub = opening_sub.group_by(
        InventoryLedger.product_id, InventoryLedger.warehouse_id
    ).subquery()
    opening_query = (
        db.query(InventoryLedger.product_id, func.sum(InventoryLedger.balance_after))
        .join(opening_sub, InventoryLedger.id == opening_sub.c.last_id)
        .group_by(InventoryLedger.product_id)
    )
    opening = {row[0]: q4(row[1] or 0) for row in opening_query.all()}

    period_query = db.query(
        InventoryLedger.product_id,
        InventoryLedger.movement_type,
        func.sum(InventoryLedger.change_qty),
    ).filter(
        InventoryLedger.created_at >= start,
        InventoryLedger.created_at < end,
    )
    if warehouse_id is not None:
        period_query = period_query.filter(InventoryLedger.warehouse_id == warehouse_id)
    period_query = period_query.group_by(
        InventoryLedger.product_id, InventoryLedger.movement_type
    )
    inbound: Dict[int, Decimal] = {}
    outbound: Dict[int, Decimal] = {}
    adjust: Dict[int, Decimal] = {}
    for product_id, movement_type, total in period_query.all():
        total = q4(total or 0)
        if movement_type in INBOUND_TYPES:
            inbound[product_id] = inbound.get(product_id, Decimal("0")) + total
        elif movement_type in OUTBOUND_TYPES:
            outbound[product_id] = outbound.get(product_id, Decimal("0")) - total
        elif movement_type in ADJUST_TYPES:
            adjust[product_id] = adjust.get(product_id, Decimal("0")) + total

    value_query = db.query(
        InventoryBalance.product_id,
        func.sum(InventoryBalance.quantity * InventoryBalance.avg_cost),
    )
    if warehouse_id is not None:
        value_query = value_query.filter(InventoryBalance.warehouse_id == warehouse_id)
    value_query = value_query.group_by(InventoryBalance.product_id)
    current_value = {row[0]: q4(row[1] or 0) for row in value_query.all()}

    product_query = db.query(Product)
    if category:
        product_query = product_query.filter(Product.category == category.strip())
    if q:
        term = f"%{q.strip()}%"
        product_query = product_query.filter(
            or_(Product.sku.ilike(term), Product.name.ilike(term))
        )
    products = product_query.order_by(Product.sku.asc()).all()

    rows: List[dict] = []
    for product in products:
        opening_qty = opening.get(product.id, Decimal("0"))
        inbound_qty = inbound.get(product.id, Decimal("0"))
        outbound_qty = outbound.get(product.id, Decimal("0"))
        adjust_qty = adjust.get(product.id, Decimal("0"))
        closing_qty = opening_qty + inbound_qty - outbound_qty + adjust_qty
        if (
            opening_qty == 0
            and inbound_qty == 0
            and outbound_qty == 0
            and adjust_qty == 0
            and closing_qty == 0
        ):
            continue
        value = current_value.get(product.id, Decimal("0"))
        rows.append(
            {
                "product_id": product.id,
                "sku": product.sku,
                "product_name": product.name,
                "unit": product.unit,
                "opening_qty": float(q4(opening_qty)),
                "inbound_qty": float(q4(inbound_qty)),
                "outbound_qty": float(q4(outbound_qty)),
                "adjust_qty": float(q4(adjust_qty)),
                "closing_qty": float(q4(closing_qty)),
                "closing_value": float(value),
            }
        )
    return rows


def flow_summary(
    db: Session,
    date_from: Optional[date],
    date_to: Optional[date],
    warehouse_id: Optional[int],
    category: Optional[str],
    q: Optional[str],
    page: int,
    page_size: int,
) -> dict:
    start_date, end_date = _flow_bounds(date_from, date_to)
    rows = _flow_rows(db, start_date, end_date, warehouse_id, category, q)
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = [FlowSummaryItem(**row).model_dump() for row in rows[start : start + page_size]]
    payload = page_payload(page_rows, total, page, page_size)
    payload["date_from"] = start_date.isoformat()
    payload["date_to"] = end_date.isoformat()
    return payload


def _safe_csv_cell(value):
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def _csv_bytes_response(buffer: io.StringIO, filename: str) -> Response:
    body = "\ufeff" + buffer.getvalue()
    return Response(
        content=body.encode("utf-8"),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


def _csv_response(headers: List[str], rows: List[List], filename: str) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_safe_csv_cell(value) for value in row])
    return _csv_bytes_response(buffer, filename)


def export_stock(
    db: Session,
    warehouse_id: Optional[int],
    category: Optional[str],
    q: Optional[str],
    include_zero: bool,
) -> Response:
    query = _stock_query(db, warehouse_id, category, q, False, include_zero)
    total = query.count()
    if total > MAX_EXPORT_ROWS:
        raise AppError(400, "EXPORT_TOO_LARGE", "导出数据超过 50000 行，请缩小筛选范围")
    rows = []
    for balance, product, warehouse in query.limit(MAX_EXPORT_ROWS).all():
        quantity = q4(balance.quantity)
        avg_cost = q4(balance.avg_cost)
        rows.append(
            [
                product.sku,
                product.name,
                product.category or "",
                product.unit,
                warehouse.code,
                warehouse.name,
                float(quantity),
                float(avg_cost),
                float(q4(quantity * avg_cost)),
                product.updated_at.isoformat() if product.updated_at else "",
            ]
        )
    headers = ["商品编码", "商品名称", "分类", "单位", "仓库编码", "仓库", "数量", "平均成本", "库存金额", "商品更新时间"]
    filename = f"stock-{business_today_date().strftime('%Y%m%d')}.csv"
    return _csv_response(headers, rows, filename)


def export_ledger(
    db: Session,
    product_id: Optional[int],
    warehouse_id: Optional[int],
    movement_type: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    ref_no: Optional[str],
) -> Response:
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

    if db.query(func.count(InventoryLedger.id)).filter(*filters).scalar() > MAX_EXPORT_ROWS:
        raise AppError(400, "EXPORT_TOO_LARGE", "导出数据超过 50000 行，请缩小筛选范围")

    query = (
        db.query(
            InventoryLedger.created_at,
            InventoryLedger.ref_no,
            Product.sku,
            Product.name,
            Warehouse.name,
            InventoryLedger.movement_type,
            InventoryLedger.change_qty,
            InventoryLedger.balance_after,
            InventoryLedger.remark,
            User.display_name,
        )
        .select_from(InventoryLedger)
        .join(Product, Product.id == InventoryLedger.product_id)
        .join(Warehouse, Warehouse.id == InventoryLedger.warehouse_id)
        .outerjoin(User, User.id == InventoryLedger.created_by)
        .filter(*filters)
        .order_by(InventoryLedger.created_at.desc(), InventoryLedger.id.desc())
    )

    headers = ["时间", "单据号", "商品编码", "商品名称", "仓库", "类型", "变动数量", "结存数量", "备注", "操作人"]
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(headers)
    for row in query.yield_per(2000):
        writer.writerow(
            [
                row[0].isoformat() if row[0] else "",
                _safe_csv_cell(row[1] or ""),
                _safe_csv_cell(row[2]),
                _safe_csv_cell(row[3]),
                _safe_csv_cell(row[4]),
                row[5],
                float(q4(row[6])),
                float(q4(row[7])),
                _safe_csv_cell(row[8] or ""),
                _safe_csv_cell(row[9] or ""),
            ]
        )
    filename = f"ledger-{business_today_date().strftime('%Y%m%d')}.csv"
    return _csv_bytes_response(buffer, filename)


def export_flow(
    db: Session,
    date_from: Optional[date],
    date_to: Optional[date],
    warehouse_id: Optional[int],
    category: Optional[str],
    q: Optional[str],
) -> Response:
    start_date, end_date = _flow_bounds(date_from, date_to)
    rows_data = _flow_rows(db, start_date, end_date, warehouse_id, category, q)
    if len(rows_data) > MAX_EXPORT_ROWS:
        raise AppError(400, "EXPORT_TOO_LARGE", "导出数据超过 50000 行，请缩小筛选范围")
    rows = [
        [
            item["sku"],
            item["product_name"],
            item["unit"],
            item["opening_qty"],
            item["inbound_qty"],
            item["outbound_qty"],
            item["adjust_qty"],
            item["closing_qty"],
            item["closing_value"],
        ]
        for item in rows_data
    ]
    headers = ["商品编码", "商品名称", "单位", "期初", "入库", "出库", "调整", "期末", "期末金额"]
    filename = f"flow-{business_today_date().strftime('%Y%m%d')}.csv"
    return _csv_response(headers, rows, filename)
