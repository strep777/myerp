from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.dates import date_range
from app.core.pagination import page_payload, paginate
from app.modules.audit.models import AuditLog


def list_logs(
    db: Session,
    user_id: Optional[int],
    action: Optional[str],
    entity_type: Optional[str],
    date_from: Optional[date],
    date_to: Optional[date],
    q: Optional[str],
    page: int,
    page_size: int,
) -> dict:
    query = db.query(AuditLog)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action.upper())
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AuditLog.summary.ilike(term),
                AuditLog.entity_no.ilike(term),
                AuditLog.username_snapshot.ilike(term),
                AuditLog.ip.ilike(term),
            )
        )
    start, end = date_range(date_from, date_to)
    if start:
        query = query.filter(AuditLog.created_at >= start)
    if end:
        query = query.filter(AuditLog.created_at < end)
    query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    items, total = paginate(query, page, page_size)
    result = [
        {
            "id": item.id,
            "user_id": item.user_id,
            "username": item.username_snapshot,
            "action": item.action,
            "entity_type": item.entity_type,
            "entity_id": item.entity_id,
            "entity_no": item.entity_no,
            "summary": item.summary,
            "ip": item.ip,
            "created_at": item.created_at,
        }
        for item in items
    ]
    return page_payload(result, total, page, page_size)
