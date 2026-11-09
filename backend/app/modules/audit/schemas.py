from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.common import Page


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int]
    username: str
    action: str
    entity_type: str
    entity_id: Optional[int]
    entity_no: str
    summary: str
    ip: str
    created_at: datetime


AuditLogPage = Page[AuditLogOut]
