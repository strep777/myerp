from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import NonNegativeQuantity, Page


class StocktakeCreate(BaseModel):
    warehouse_id: int
    remark: str = Field(default="", max_length=240)

    @field_validator("remark")
    @classmethod
    def strip_remark(cls, value: str) -> str:
        return value.strip()


class StocktakeLineUpdate(BaseModel):
    line_id: int
    counted_quantity: NonNegativeQuantity
    remark: str = Field(default="", max_length=160)

    @field_validator("remark")
    @classmethod
    def strip_remark(cls, value: str) -> str:
        return value.strip()


class StocktakeLinesUpdate(BaseModel):
    lines: List[StocktakeLineUpdate] = Field(min_length=1, max_length=2000)

    @field_validator("lines")
    @classmethod
    def unique_lines(cls, lines: List[StocktakeLineUpdate]) -> List[StocktakeLineUpdate]:
        ids = [line.line_id for line in lines]
        if len(ids) != len(set(ids)):
            raise ValueError("盘点明细不能重复")
        return lines


class StocktakeLineOut(BaseModel):
    id: int
    product_id: int
    sku: str
    product_name: str
    unit: str
    book_quantity: float
    counted_quantity: float
    difference_quantity: float
    remark: str


class StocktakeOut(BaseModel):
    id: int
    stocktake_no: str
    warehouse_id: int
    warehouse_name: str
    status: str
    remark: str
    created_by: int
    created_by_name: str
    completed_by: Optional[int]
    completed_by_name: Optional[str]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    line_count: int
    difference_line_count: int
    total_difference_quantity: float
    lines: List[StocktakeLineOut]


class StocktakeSummary(BaseModel):
    id: int
    stocktake_no: str
    warehouse_id: int
    warehouse_name: str
    status: str
    line_count: int
    difference_line_count: int
    total_difference_quantity: float
    created_by_name: str
    completed_at: Optional[datetime]
    created_at: datetime


StocktakePage = Page[StocktakeSummary]
