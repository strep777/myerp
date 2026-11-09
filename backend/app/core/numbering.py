from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings


def business_today() -> str:
    return datetime.now(settings.tz).strftime("%Y%m%d")


def next_document_no(db: Session, model: Any, prefix: str) -> str:
    date_part = business_today()
    like = f"{prefix}-{date_part}-%"
    column = getattr(model, "order_no", None)
    if column is None:
        column = getattr(model, "stocktake_no")
    latest = (
        db.query(func.max(column))
        .filter(column.like(like))
        .scalar()
    )
    sequence = 1
    if latest:
        try:
            sequence = int(str(latest).rsplit("-", 1)[1]) + 1
        except (IndexError, ValueError):
            sequence = 1
    return f"{prefix}-{date_part}-{sequence:04d}"


def adjustment_no(sequence: int) -> str:
    return f"ADJ-{business_today()}-{sequence:04d}"
