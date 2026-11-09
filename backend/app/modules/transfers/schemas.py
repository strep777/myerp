from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import Page, Quantity


class TransferLineIn(BaseModel):
    product_id: int
    quantity: Quantity
    remark: str = Field(default="", max_length=160)

    @field_validator("remark")
    @classmethod
    def strip_remark(cls, value: str) -> str:
        return value.strip()


class TransferCreate(BaseModel):
    from_warehouse_id: int
    to_warehouse_id: int
    remark: str = Field(default="", max_length=240)
    lines: List[TransferLineIn] = Field(min_length=1, max_length=200)

    @field_validator("remark")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_order(self):
        if self.from_warehouse_id == self.to_warehouse_id:
            raise ValueError("调出仓库和调入仓库不能相同")
        product_ids = [line.product_id for line in self.lines]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("同一商品不能重复添加")
        return self


class TransferLineOut(BaseModel):
    id: int
    product_id: int
    sku: str
    product_name: str
    unit: str
    quantity: float
    remark: str


class TransferOrderOut(BaseModel):
    id: int
    order_no: str
    status: str
    from_warehouse_id: int
    from_warehouse_name: str
    to_warehouse_id: int
    to_warehouse_name: str
    remark: str
    total_quantity: float
    created_by: int
    created_by_name: str
    confirmed_by: Optional[int]
    confirmed_by_name: Optional[str]
    confirmed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    lines: List[TransferLineOut]


class TransferOrderSummary(BaseModel):
    id: int
    order_no: str
    status: str
    from_warehouse_id: int
    from_warehouse_name: str
    to_warehouse_id: int
    to_warehouse_name: str
    total_quantity: float
    line_count: int
    created_by_name: str
    created_at: datetime
    updated_at: datetime


TransferOrderPage = Page[TransferOrderSummary]
