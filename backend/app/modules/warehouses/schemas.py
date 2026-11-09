from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel, Page


class WarehouseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=1, max_length=80)
    location: str = Field(default="", max_length=160)
    manager: str = Field(default="", max_length=80)
    remark: str = Field(default="", max_length=240)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("仓库编码不能为空")
        return value

    @field_validator("name", "location", "manager", "remark")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class WarehouseUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=2, max_length=30)
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    location: Optional[str] = Field(default=None, max_length=160)
    manager: Optional[str] = Field(default=None, max_length=80)
    remark: Optional[str] = Field(default=None, max_length=240)
    is_active: Optional[bool] = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip().upper()
        if not value:
            raise ValueError("仓库编码不能为空")
        return value

    @field_validator("name", "location", "manager", "remark")
    @classmethod
    def strip_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else value


class WarehouseOut(ORMModel):
    id: int
    code: str
    name: str
    location: str
    manager: str
    remark: str
    is_active: bool
    sku_count: int = 0
    total_quantity: float = 0
    created_at: datetime
    updated_at: datetime


class WarehouseOption(ORMModel):
    id: int
    code: str
    name: str


WarehousePage = Page[WarehouseOut]
