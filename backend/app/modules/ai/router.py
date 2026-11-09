from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_roles
from app.core.roles import Role
from app.modules.ai import providers, service
from app.modules.ai.schemas import (
    AiAnalyzeOut,
    AiImportOut,
    AiImportRequest,
    AiSettingsOut,
    AiSettingsUpdate,
    AiTestOut,
    AiTestRequest,
)
from app.modules.users.models import User


router = APIRouter(prefix="/ai", tags=["AI 智能入库"])


@router.get("/settings", response_model=AiSettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN)),
) -> AiSettingsOut:
    return service.get_settings(db)


@router.get("/ollama/models")
def ollama_models(
    base_url: str = Query(default="http://127.0.0.1:11434"),
    _: User = Depends(require_roles(Role.ADMIN)),
) -> dict:
    """List models actually installed in Ollama (never a hard-coded name)."""
    models = providers.list_ollama_models(base_url)
    return {"base_url": base_url.rstrip("/"), "models": models}


@router.put("/settings", response_model=AiSettingsOut)
def update_settings(
    payload: AiSettingsUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
) -> AiSettingsOut:
    return service.update_settings(db, payload, actor)


@router.post("/settings/test", response_model=AiTestOut)
def test_settings(
    payload: AiTestRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.ADMIN)),
) -> dict:
    return service.test_settings(db, payload)


@router.post("/analyze", response_model=AiAnalyzeOut)
async def analyze(
    image: Optional[UploadFile] = File(default=None),
    link: str = Form(default=""),
    text: str = Form(default=""),
    provider: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR)),
) -> AiAnalyzeOut:
    raw = await image.read() if image is not None else None
    return await service.analyze(db, actor, raw, link, text, provider)


@router.post("/import", response_model=AiImportOut)
def import_preview(
    payload: AiImportRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN, Role.MANAGER, Role.OPERATOR)),
) -> AiImportOut:
    return service.import_preview(db, actor, payload)
