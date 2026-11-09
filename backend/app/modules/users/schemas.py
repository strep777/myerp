from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.roles import Role
from app.schemas.common import ORMModel, Page


class UserOut(ORMModel):
    id: int
    username: str
    display_name: str
    role: str
    is_active: bool
    must_change_password: bool
    created_at: datetime


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=64)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=8, max_length=64)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_]+$")
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=64)
    role: Role = Role.VIEWER

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        return value.strip()


class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    role: Optional[Role] = None
    is_active: Optional[bool] = None

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else value


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=64)


UserPage = Page[UserOut]
