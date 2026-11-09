from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional, Tuple

from app.core.config import settings


def day_start(value: date) -> datetime:
    local = datetime.combine(value, time.min, tzinfo=settings.tz)
    return local.astimezone(timezone.utc)


def day_end_exclusive(value: date) -> datetime:
    local = datetime.combine(value + timedelta(days=1), time.min, tzinfo=settings.tz)
    return local.astimezone(timezone.utc)


def date_range(
    date_from: Optional[date], date_to: Optional[date]
) -> Tuple[Optional[datetime], Optional[datetime]]:
    start = day_start(date_from) if date_from else None
    end = day_end_exclusive(date_to) if date_to else None
    return start, end


def business_today_date() -> date:
    return datetime.now(settings.tz).date()
