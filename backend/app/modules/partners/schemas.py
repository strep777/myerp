from __future__ import annotations

from datetime import datetime
from typing import Optional

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel, Page


def _clean_email(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return ""
    try:
        result = validate_email(value, check_deliverability=False)
    except EmailNotValidError as exc:
        raise ValueError("邮箱格式不正确") from exc
    return result.normalized


class PartnerCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=1, max_length=120)
    contact_person: str = Field(default="", max_length=80)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=120)
    address: str = Field(default="", max_length=240)
    remark: str = Field(default="", max_length=240)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("编码不能为空")
        return value

    @field_validator("name", "contact_person", "phone", "address", "remark")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("email")
    @classmethod
    def validate_email_value(cls, value: str) -> str:
        cleaned = _clean_email(value)
        return cleaned or ""


class PartnerUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=2, max_length=30)
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    contact_person: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=120)
    address: Optional[str] = Field(default=None, max_length=240)
    remark: Optional[str] = Field(default=None, max_length=240)
    is_active: Optional[bool] = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip().upper()
        if not value:
            raise ValueError("编码不能为空")
        return value

    @field_validator("name", "contact_person", "phone", "address", "remark")
    @classmethod
    def strip_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else value

    @field_validator("email")
    @classmethod
    def validate_email_value(cls, value: Optional[str]) -> Optional[str]:
        return _clean_email(value)


class PartnerOut(ORMModel):
    id: int
    code: str
    name: str
    contact_person: str
    phone: str
    email: str
    address: str
    remark: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PartnerOption(ORMModel):
    id: int
    code: str
    name: str


PartnerPage = Page[PartnerOut]
