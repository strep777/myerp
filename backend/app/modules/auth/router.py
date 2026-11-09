from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.context import current_request_ip
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import cookie_max_age, create_access_token
from app.modules.auth import service
from app.modules.users.models import User
from app.modules.users.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    UserOut,
)


router = APIRouter(prefix="/auth", tags=["认证"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=cookie_max_age(),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.cookie_name,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> User:
    ip = current_request_ip()
    user = service.authenticate(db, payload.username, payload.password, ip)
    token = create_access_token(user.id, user.role, user.token_version)
    _set_session_cookie(response, token)
    service.login_succeeded(db, user, ip)
    return user


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def logout(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    service.logout(db, user)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_session_cookie(response)
    return response


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    service.change_password(db, user, payload.old_password, payload.new_password)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_session_cookie(response)
    return response
