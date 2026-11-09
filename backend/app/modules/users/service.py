from __future__ import annotations

from typing import Optional

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.errors import AppError
from app.core.pagination import page_payload, paginate
from app.core.roles import Role
from app.core.security import hash_password, validate_password_strength
from app.modules.users.models import User
from app.modules.users.schemas import UserCreate, UserUpdate


def list_users(
    db: Session,
    q: Optional[str],
    role: Optional[str],
    is_active: Optional[bool],
    page: int,
    page_size: int,
) -> dict:
    query = db.query(User)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(User.username.ilike(term), User.display_name.ilike(term))
        )
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    query = query.order_by(User.id.asc())
    items, total = paginate(query, page, page_size)
    return page_payload(items, total, page, page_size)


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "用户不存在")
    return user


def create_user(db: Session, payload: UserCreate, actor: User) -> User:
    username = payload.username.strip().lower()
    if db.query(User).filter(User.username == username).first():
        raise AppError(
            409,
            "USERNAME_EXISTS",
            "用户名已存在",
            fields={"username": "用户名已存在"},
        )
    problem = validate_password_strength(payload.password, username)
    if problem:
        raise AppError(
            400,
            "WEAK_PASSWORD",
            problem,
            fields={"password": problem},
        )
    user = User(
        username=username,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role.value,
        is_active=True,
        token_version=0,
        must_change_password=False,
    )
    db.add(user)
    try:
        db.flush()
        write_audit(
            db,
            action="CREATE",
            entity_type="user",
            entity_id=user.id,
            entity_no=user.username,
            summary=f"创建用户 {user.display_name}（{user.role}）",
            user=actor,
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "USERNAME_EXISTS", "用户名已存在")
    db.refresh(user)
    return user


def update_user(
    db: Session,
    user_id: int,
    payload: UserUpdate,
    actor: User,
) -> User:
    user = get_user(db, user_id)
    new_role = payload.role.value if payload.role is not None else user.role
    new_active = payload.is_active if payload.is_active is not None else user.is_active

    if user.id == actor.id and new_active is False:
        raise AppError(409, "SELF_DISABLE", "不能停用自己的账号")

    losing_admin = (
        user.role == Role.ADMIN.value
        and user.is_active
        and (new_role != Role.ADMIN.value or not new_active)
    )
    if losing_admin:
        other_admins = (
            db.query(User)
            .filter(
                User.role == Role.ADMIN.value,
                User.is_active.is_(True),
                User.id != user.id,
            )
            .count()
        )
        if other_admins == 0:
            raise AppError(
                409,
                "LAST_ADMIN",
                "必须保留至少一个启用的管理员",
            )

    old_active = user.is_active
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    user.role = new_role
    user.is_active = new_active

    action = "USER_DISABLE" if old_active and not new_active else "UPDATE"
    summary = f"更新用户 {user.display_name}"
    if old_active and not new_active:
        summary = f"停用用户 {user.display_name}"
    elif not old_active and new_active:
        summary = f"启用用户 {user.display_name}"

    write_audit(
        db,
        action=action,
        entity_type="user",
        entity_id=user.id,
        entity_no=user.username,
        summary=summary,
        detail={
            "role": user.role,
            "is_active": user.is_active,
        },
        user=actor,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "USER_UPDATE_CONFLICT", "用户更新失败，请重试")
    db.refresh(user)
    return user


def reset_password(
    db: Session,
    user_id: int,
    new_password: str,
    actor: User,
) -> None:
    user = get_user(db, user_id)
    problem = validate_password_strength(new_password, user.username)
    if problem:
        raise AppError(
            400,
            "WEAK_PASSWORD",
            problem,
            fields={"new_password": problem},
        )
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    user.must_change_password = True
    write_audit(
        db,
        action="PASSWORD_RESET",
        entity_type="user",
        entity_id=user.id,
        entity_no=user.username,
        summary=f"重置用户 {user.username} 的密码",
        user=actor,
    )
    db.commit()
