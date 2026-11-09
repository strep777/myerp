from __future__ import annotations

from datetime import date, datetime
from typing import List

from pydantic import BaseModel

from app.modules.reports.schemas import LowStockItem


class DashboardSummary(BaseModel):
    product_count: int
    warehouse_count: int
    total_quantity: float
    total_value: float
    low_stock_count: int
    draft_documents: int
    today_inbound: int
    today_outbound: int


class TrendItem(BaseModel):
    date: date
    inbound_qty: float
    outbound_qty: float


class TrendResponse(BaseModel):
    items: List[TrendItem]


class RecentDocument(BaseModel):
    type: str
    id: int
    no: str
    status: str
    warehouse_name: str
    quantity: float
    created_at: datetime


class RecentDocumentsResponse(BaseModel):
    items: List[RecentDocument]


class LowStockResponse(BaseModel):
    items: List[LowStockItem]
