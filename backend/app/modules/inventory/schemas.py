from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import NonNegativeQuantity, Page


class BalanceOut(BaseModel):
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


class LedgerOut(BaseModel):
    id: int
    product_id: int
    sku: str
    product_name: str
    warehouse_id: int
    warehouse_name: str
    movement_type: str
    change_qty: float
    unit_cost: float
    balance_after: float
    ref_type: str
    ref_id: Optional[int]
    ref_no: str
    remark: str
    created_by_name: str
    created_at: datetime


class AdjustmentCreate(BaseModel):
    product_id: int
    warehouse_id: int
    quantity_change: Decimal = Field(max_digits=18, decimal_places=4)
    reason: str = Field(min_length=2, max_length=120)

    @field_validator("quantity_change")
    @classmethod
    def non_zero(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("调整数量不能为 0")
        return value

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return value.strip()


class AdjustmentResult(BaseModel):
    product_id: int
    sku: str
    product_name: str
    warehouse_id: int
    warehouse_name: str
    quantity: float
    avg_cost: float
    change_qty: float
    ledger_id: int


class InventoryOverview(BaseModel):
    sku_count: int
    total_quantity: float
    total_value: float
    low_stock_count: int
    warehouse_count: int


BalancePage = Page[BalanceOut]
LedgerPage = Page[LedgerOut]
