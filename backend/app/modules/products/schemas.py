from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import NonNegativeQuantity, ORMModel, Page


class ProductCreate(BaseModel):
    sku: str = Field(min_length=2, max_length=50)
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(default="", max_length=60)
    spec: str = Field(default="", max_length=120)
    unit: str = Field(default="件", min_length=1, max_length=20)
    barcode: Optional[str] = Field(default=None, max_length=64)
    safety_stock: NonNegativeQuantity = Decimal("0")
    reference_cost: NonNegativeQuantity = Decimal("0")
    reference_price: NonNegativeQuantity = Decimal("0")
    remark: str = Field(default="", max_length=240)
    is_active: bool = True

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("SKU 不能为空")
        return value

    @field_validator("name", "category", "spec", "unit", "remark")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("barcode")
    @classmethod
    def empty_barcode_to_none(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ProductUpdate(BaseModel):
    sku: Optional[str] = Field(default=None, min_length=2, max_length=50)
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category: Optional[str] = Field(default=None, max_length=60)
    spec: Optional[str] = Field(default=None, max_length=120)
    unit: Optional[str] = Field(default=None, min_length=1, max_length=20)
    barcode: Optional[str] = Field(default=None, max_length=64)
    safety_stock: Optional[NonNegativeQuantity] = None
    reference_cost: Optional[NonNegativeQuantity] = None
    reference_price: Optional[NonNegativeQuantity] = None
    remark: Optional[str] = Field(default=None, max_length=240)
    is_active: Optional[bool] = None

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip().upper()
        if not value:
            raise ValueError("SKU 不能为空")
        return value

    @field_validator("name", "category", "spec", "unit", "remark")
    @classmethod
    def strip_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else value

    @field_validator("barcode")
    @classmethod
    def empty_barcode_to_none(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ProductOut(ORMModel):
    id: int
    sku: str
    name: str
    category: str
    spec: str
    unit: str
    barcode: Optional[str]
    safety_stock: NonNegativeQuantity
    reference_cost: NonNegativeQuantity
    reference_price: NonNegativeQuantity
    remark: str
    is_active: bool
    total_quantity: float = 0
    is_low_stock: bool = False
    created_at: datetime
    updated_at: datetime


class ProductOption(ORMModel):
    id: int
    sku: str
    name: str
    unit: str
    spec: str


class ProductStockClearOut(BaseModel):
    product_id: int
    cleared_warehouses: int
    cleared_quantity: float


ProductPage = Page[ProductOut]
