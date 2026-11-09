from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import Money, ORMModel, Page, Quantity


class InboundLineIn(BaseModel):
    product_id: int
    quantity: Quantity
    unit_cost: Money = 0
    remark: str = Field(default="", max_length=160)

    @field_validator("remark")
    @classmethod
    def strip_remark(cls, value: str) -> str:
        return value.strip()


class InboundCreate(BaseModel):
    supplier_id: Optional[int] = None
    warehouse_id: int
    related_no: str = Field(default="", max_length=40)
    expected_date: Optional[date] = None
    remark: str = Field(default="", max_length=240)
    lines: List[InboundLineIn] = Field(min_length=1, max_length=200)

    @field_validator("related_no", "remark")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def unique_products(self):
        product_ids = [line.product_id for line in self.lines]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("同一商品不能重复添加")
        return self


class InboundLineOut(BaseModel):
    id: int
    product_id: int
    sku: str
    product_name: str
    unit: str
    quantity: float
    unit_cost: float
    amount: float
    remark: str


class InboundOrderOut(BaseModel):
    id: int
    order_no: str
    status: str
    supplier_id: Optional[int]
    supplier_name: str
    warehouse_id: int
    warehouse_name: str
    related_no: str
    expected_date: Optional[date]
    remark: str
    total_quantity: float
    total_amount: float
    created_by: int
    created_by_name: str
    confirmed_by: Optional[int]
    confirmed_by_name: Optional[str]
    confirmed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    lines: List[InboundLineOut]


class InboundOrderSummary(BaseModel):
    id: int
    order_no: str
    status: str
    supplier_id: Optional[int]
    supplier_name: str
    warehouse_id: int
    warehouse_name: str
    related_no: str
    expected_date: Optional[date]
    total_quantity: float
    total_amount: float
    line_count: int
    created_by_name: str
    created_at: datetime
    updated_at: datetime


InboundOrderPage = Page[InboundOrderSummary]
