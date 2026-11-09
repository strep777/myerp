from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import q4
from app.core.dates import business_today_date, day_end_exclusive, day_start
from app.modules.dashboard.schemas import (
    DashboardSummary,
    RecentDocument,
    RecentDocumentsResponse,
    TrendItem,
    TrendResponse,
)
from app.modules.inbound.models import InboundOrder
from app.modules.inventory.models import InventoryBalance
from app.modules.outbound.models import OutboundOrder
from app.modules.products.models import Product
from app.modules.reports import service as reports_service
from app.modules.stocktakes.models import Stocktake
from app.modules.transfers.models import TransferOrder
from app.modules.warehouses.models import Warehouse


def summary(db: Session, warehouse_id: Optional[int]) -> dict:
    today = business_today_date()
    product_query = db.query(Product).filter(Product.is_active.is_(True))
    if warehouse_id is not None:
        product_query = product_query.filter(
            Product.id.in_(
                db.query(InventoryBalance.product_id).filter(
                    InventoryBalance.warehouse_id == warehouse_id
                )
            )
        )
    product_count = product_query.count()

    if warehouse_id is not None:
        warehouse_count = 1
    else:
        warehouse_count = (
            db.query(Warehouse).filter(Warehouse.is_active.is_(True)).count()
        )

    balance_query = db.query(
        func.coalesce(func.sum(InventoryBalance.quantity), 0),
        func.coalesce(
            func.sum(InventoryBalance.quantity * InventoryBalance.avg_cost), 0
        ),
    )
    if warehouse_id is not None:
        balance_query = balance_query.filter(InventoryBalance.warehouse_id == warehouse_id)
    total_quantity, total_value = balance_query.one()

    low_query = (
        db.query(func.count(InventoryBalance.id))
        .join(Product, Product.id == InventoryBalance.product_id)
        .filter(
            Product.is_active.is_(True),
            Product.safety_stock > 0,
            InventoryBalance.quantity <= Product.safety_stock,
        )
    )
    if warehouse_id is not None:
        low_query = low_query.filter(InventoryBalance.warehouse_id == warehouse_id)
    low_stock_count = low_query.scalar() or 0

    draft_documents = 0
    for model in (InboundOrder, OutboundOrder, TransferOrder, Stocktake):
        query = db.query(func.count(model.id)).filter(model.status == "DRAFT")
        if warehouse_id is not None:
            if model is TransferOrder:
                from sqlalchemy import or_

                query = query.filter(
                    or_(
                        TransferOrder.from_warehouse_id == warehouse_id,
                        TransferOrder.to_warehouse_id == warehouse_id,
                    )
                )
            else:
                query = query.filter(model.warehouse_id == warehouse_id)
        draft_documents += query.scalar() or 0

    start = day_start(today)
    end = day_end_exclusive(today)
    today_inbound = (
        db.query(func.count(InboundOrder.id))
        .filter(
            InboundOrder.status == "CONFIRMED",
            InboundOrder.confirmed_at >= start,
            InboundOrder.confirmed_at < end,
        )
    )
    today_outbound = (
        db.query(func.count(OutboundOrder.id))
        .filter(
            OutboundOrder.status == "CONFIRMED",
            OutboundOrder.confirmed_at >= start,
            OutboundOrder.confirmed_at < end,
        )
    )
    if warehouse_id is not None:
        today_inbound = today_inbound.filter(InboundOrder.warehouse_id == warehouse_id)
        today_outbound = today_outbound.filter(OutboundOrder.warehouse_id == warehouse_id)

    return DashboardSummary(
        product_count=product_count,
        warehouse_count=warehouse_count,
        total_quantity=float(q4(total_quantity or 0)),
        total_value=float(q4(total_value or 0)),
        low_stock_count=int(low_stock_count),
        draft_documents=int(draft_documents),
        today_inbound=int(today_inbound.scalar() or 0),
        today_outbound=int(today_outbound.scalar() or 0),
    ).model_dump()


def trend(db: Session, days: int, warehouse_id: Optional[int]) -> dict:
    today = business_today_date()
    start_date = today - timedelta(days=days - 1)
    start = day_start(start_date)
    inbound_rows = (
        db.query(InboundOrder.confirmed_at, InboundOrder.total_quantity)
        .filter(
            InboundOrder.status == "CONFIRMED",
            InboundOrder.confirmed_at >= start,
        )
    )
    outbound_rows = (
        db.query(OutboundOrder.confirmed_at, OutboundOrder.total_quantity)
        .filter(
            OutboundOrder.status == "CONFIRMED",
            OutboundOrder.confirmed_at >= start,
        )
    )
    if warehouse_id is not None:
        inbound_rows = inbound_rows.filter(InboundOrder.warehouse_id == warehouse_id)
        outbound_rows = outbound_rows.filter(OutboundOrder.warehouse_id == warehouse_id)

    inbound_map: Dict[date, Decimal] = {}
    outbound_map: Dict[date, Decimal] = {}
    for confirmed_at, quantity in inbound_rows.all():
        if confirmed_at is None:
            continue
        local_date = confirmed_at.astimezone(settings.tz).date()
        inbound_map[local_date] = inbound_map.get(local_date, Decimal("0")) + q4(quantity)
    for confirmed_at, quantity in outbound_rows.all():
        if confirmed_at is None:
            continue
        local_date = confirmed_at.astimezone(settings.tz).date()
        outbound_map[local_date] = outbound_map.get(local_date, Decimal("0")) + q4(quantity)

    items = []
    for offset in range(days):
        current = start_date + timedelta(days=offset)
        items.append(
            TrendItem(
                date=current,
                inbound_qty=float(q4(inbound_map.get(current, 0))),
                outbound_qty=float(q4(outbound_map.get(current, 0))),
            )
        )
    return TrendResponse(items=items).model_dump()


def recent_documents(db: Session, limit: int) -> dict:
    rows: List[dict] = []
    queries = [
        ("INBOUND", InboundOrder),
        ("OUTBOUND", OutboundOrder),
        ("TRANSFER", TransferOrder),
    ]
    for doc_type, model in queries:
        records = (
            db.query(model)
            .order_by(model.created_at.desc(), model.id.desc())
            .limit(limit)
            .all()
        )
        for record in records:
            rows.append(
                {
                    "type": doc_type,
                    "id": record.id,
                    "no": record.order_no,
                    "status": record.status,
                    "warehouse_id": (
                        record.from_warehouse_id
                        if doc_type == "TRANSFER"
                        else record.warehouse_id
                    ),
                    "quantity": float(q4(record.total_quantity)),
                    "created_at": record.created_at,
                }
            )
    rows.sort(key=lambda item: item["created_at"], reverse=True)
    rows = rows[:limit]
    warehouse_ids = {item["warehouse_id"] for item in rows}
    warehouses = {
        warehouse.id: warehouse.name
        for warehouse in db.query(Warehouse).filter(Warehouse.id.in_(warehouse_ids)).all()
    } if warehouse_ids else {}
    items = [
        RecentDocument(
            type=item["type"],
            id=item["id"],
            no=item["no"],
            status=item["status"],
            warehouse_name=warehouses.get(item["warehouse_id"], ""),
            quantity=item["quantity"],
            created_at=item["created_at"],
        )
        for item in rows
    ]
    return RecentDocumentsResponse(items=items).model_dump()


def low_stock(db: Session, limit: int, warehouse_id: Optional[int]) -> dict:
    payload = reports_service.low_stock(
        db, warehouse_id, None, None, 1, limit
    )
    return {"items": payload["items"]}
