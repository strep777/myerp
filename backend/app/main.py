from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import init_db
from app.core.errors import register_exception_handlers
from app.core.middleware import register_middleware
from app.modules.ai.router import router as ai_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.inbound.router import router as inbound_router
from app.modules.inventory.router import router as inventory_router
from app.modules.outbound.router import router as outbound_router
from app.modules.partners.router import customer_router, router as partners_router
from app.modules.products.router import router as products_router
from app.modules.reports.router import router as reports_router
from app.modules.stocktakes.router import router as stocktakes_router
from app.modules.system.router import router as system_router
from app.modules.transfers.router import router as transfers_router
from app.modules.users.router import router as users_router
from app.modules.warehouses.router import router as warehouses_router
from app.seed import run_seed


logger = logging.getLogger("lager")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    init_db()
    run_seed()
    logger.info(
        "Lager %s started; database=%s seed_demo=%s",
        settings.version,
        settings.database_url,
        settings.seed_demo_data,
    )
    yield


docs_enabled = settings.enable_docs
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan,
    docs_url="/api/docs" if docs_enabled else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if docs_enabled else None,
)

register_middleware(app)
register_exception_handlers(app)

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

for api_router in (
    auth_router,
    users_router,
    products_router,
    warehouses_router,
    partners_router,
    customer_router,
    inventory_router,
    inbound_router,
    outbound_router,
    transfers_router,
    stocktakes_router,
    reports_router,
    dashboard_router,
    audit_router,
    ai_router,
    system_router,
):
    app.include_router(api_router, prefix="/api/v1")


frontend_path = settings.frontend_path
assets_path = frontend_path / "assets"
if assets_path.is_dir():
    app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")


@app.get("/", include_in_schema=False)
def index():
    index_file = frontend_path / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    return JSONResponse(
        {
            "name": settings.app_name,
            "version": settings.version,
            "message": "前端尚未构建，请运行 pnpm build；API 文档位于 /api/docs",
        }
    )


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="接口不存在")
    index_file = frontend_path / "index.html"
    if not index_file.is_file():
        raise HTTPException(status_code=404, detail="前端尚未构建")
    candidate = (frontend_path / full_path).resolve()
    try:
        candidate.relative_to(frontend_path.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="文件不存在")
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(index_file)
