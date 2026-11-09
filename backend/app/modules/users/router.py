from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.users import service
from app.modules.users.models import User
from app.modules.users.schemas import (
    PasswordResetRequest,
    UserCreate,
    UserOut,
    UserPage,
    UserUpdate,
)


router = APIRouter(prefix="/users", tags=["用户"])


@router.get("", response_model=UserPage)
def list_users(
    q: Optional[str] = None,
    role: Optional[Role] = None,
    is_active: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN)),
) -> dict:
    return service.list_users(
        db, q, role.value if role else None, is_active, page, page_size
    )


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN)),
) -> User:
    return service.get_user(db, user_id)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
) -> User:
    return service.create_user(db, payload, actor)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
) -> User:
    return service.update_user(db, user_id, payload, actor)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def reset_password(
    user_id: int,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
) -> None:
    service.reset_password(db, user_id, payload.new_password, actor)
