from __future__ import annotations

from typing import Any, List, Optional, Type

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.errors import AppError
from app.core.pagination import page_payload, paginate
from app.modules.inbound.models import InboundOrder
from app.modules.outbound.models import OutboundOrder
from app.modules.partners.models import Customer, Supplier
from app.modules.partners.schemas import PartnerCreate, PartnerUpdate
from app.modules.users.models import User


PARTNER_LABELS = {"supplier": "供应商", "customer": "客户"}


def list_partners(
    db: Session,
    model: Type[Any],
    q: Optional[str],
    is_active: Optional[bool],
    page: int,
    page_size: int,
) -> dict:
    query = db.query(model)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                model.code.ilike(term),
                model.name.ilike(term),
                model.contact_person.ilike(term),
                model.phone.ilike(term),
            )
        )
    if is_active is not None:
        query = query.filter(model.is_active == is_active)
    query = query.order_by(model.id.asc())
    items, total = paginate(query, page, page_size)
    return page_payload(items, total, page, page_size)


def list_options(db: Session, model: Type[Any], q: Optional[str], limit: int) -> List[Any]:
    query = db.query(model).filter(model.is_active.is_(True))
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(model.code.ilike(term), model.name.ilike(term)))
    return query.order_by(model.code.asc()).limit(limit).all()


def get_partner(db: Session, model: Type[Any], partner_id: int, kind: str) -> Any:
    item = db.get(model, partner_id)
    if item is None:
        raise AppError(404, "PARTNER_NOT_FOUND", f"{PARTNER_LABELS[kind]}不存在")
    return item


def _ensure_code(
    db: Session,
    model: Type[Any],
    code: Optional[str],
    kind: str,
    exclude_id: Optional[int] = None,
) -> None:
    if not code:
        return
    query = db.query(model).filter(model.code == code)
    if exclude_id:
        query = query.filter(model.id != exclude_id)
    if query.first():
        raise AppError(
            409,
            "PARTNER_CODE_EXISTS",
            f"{PARTNER_LABELS[kind]}编码已存在",
            fields={"code": "编码已存在"},
        )


def create_partner(
    db: Session,
    model: Type[Any],
    payload: PartnerCreate,
    actor: User,
    kind: str,
) -> Any:
    _ensure_code(db, model, payload.code, kind)
    item = model(**payload.model_dump())
    db.add(item)
    try:
        db.flush()
        write_audit(
            db,
            action="CREATE",
            entity_type=kind,
            entity_id=item.id,
            entity_no=item.code,
            summary=f"创建{PARTNER_LABELS[kind]} {item.name}",
            user=actor,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "PARTNER_CODE_EXISTS", f"{PARTNER_LABELS[kind]}编码已存在")
    db.refresh(item)
    return item


def update_partner(
    db: Session,
    model: Type[Any],
    partner_id: int,
    payload: PartnerUpdate,
    actor: User,
    kind: str,
) -> Any:
    item = get_partner(db, model, partner_id, kind)
    changes = payload.model_dump(exclude_unset=True)
    _ensure_code(db, model, changes.get("code"), kind, exclude_id=item.id)
    for field, value in changes.items():
        setattr(item, field, value)
    write_audit(
        db,
        action="UPDATE",
        entity_type=kind,
        entity_id=item.id,
        entity_no=item.code,
        summary=f"更新{PARTNER_LABELS[kind]} {item.name}",
        detail={"fields": list(changes.keys())},
        user=actor,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "PARTNER_CODE_EXISTS", f"{PARTNER_LABELS[kind]}编码已存在")
    db.refresh(item)
    return item


def delete_partner(
    db: Session,
    model: Type[Any],
    partner_id: int,
    actor: User,
    kind: str,
) -> None:
    item = get_partner(db, model, partner_id, kind)
    if kind == "supplier":
        referenced = (
            db.query(InboundOrder.id).filter(InboundOrder.supplier_id == item.id).first()
        )
    else:
        referenced = (
            db.query(OutboundOrder.id).filter(OutboundOrder.customer_id == item.id).first()
        )
    if referenced:
        raise AppError(
            409,
            "PARTNER_IN_USE",
            f"{PARTNER_LABELS[kind]}已被单据引用，不能删除，只能停用",
        )
    write_audit(
        db,
        action="DELETE",
        entity_type=kind,
        entity_id=item.id,
        entity_no=item.code,
        summary=f"删除{PARTNER_LABELS[kind]} {item.name}",
        user=actor,
    )
    db.delete(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "PARTNER_IN_USE", "该数据已被引用，不能删除")
