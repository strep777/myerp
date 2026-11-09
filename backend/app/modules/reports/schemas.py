from __future__ import annotations

from datetime import date, datetime
from typing import List

from pydantic import BaseModel

from app.schemas.common import Page


class StockReportItem(BaseModel):
    product_id: int
    sku: str
    product_name: str
    unit: str
    category: str
    warehouse_id: int
    warehouse_name: str
    quantity: float
    avg_cost: float
    stock_value: float
    safety_stock: float
    is_low: bool
    updated_at: datetime


class LowStockItem(StockReportItem):
    shortage: float
    recommended_qty: float


class FlowSummaryItem(BaseModel):
    product_id: int
    sku: str
    product_name: str
    unit: str
    opening_qty: float
    inbound_qty: float
    outbound_qty: float
    adjust_qty: float
    closing_qty: float
    closing_value: float


class StockReportPage(Page[StockReportItem]):
    total_value: float


class LowStockPage(Page[LowStockItem]):
    pass


class FlowSummaryPage(Page[FlowSummaryItem]):
    date_from: date
    date_to: date


class FlowExportMeta(BaseModel):
    date_from: date
    date_to: date
    items: List[FlowSummaryItem]
