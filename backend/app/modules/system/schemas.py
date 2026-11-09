from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class HealthOut(BaseModel):
    status: Literal["ok"]
    time: datetime
    version: str


class SystemInfoOut(BaseModel):
    name: str
    version: str
    timezone: str
    database: str
    user_count: int
    uptime_seconds: int
