from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.context import current_request_id


logger = logging.getLogger("lager.errors")


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        detail: str,
        fields: Optional[Dict[str, str]] = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.code = code
        self.detail = detail
        self.fields = fields


def error_content(
    code: str,
    detail: str,
    fields: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    content: Dict[str, Any] = {
        "detail": detail,
        "code": code,
        "request_id": current_request_id(),
    }
    if fields:
        content["fields"] = fields
    return content


def error_response(
    status_code: int,
    code: str,
    detail: str,
    fields: Optional[Dict[str, str]] = None,
    headers: Optional[Dict[str, str]] = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(error_content(code, detail, fields)),
        headers=headers,
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.detail, exc.fields)


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    fields: Dict[str, str] = {}
    for item in exc.errors():
        location: List[Any] = list(item.get("loc", ()))
        if location and location[0] in ("body", "query", "path", "header"):
            location = location[1:]
        key = ".".join(str(part) for part in location) or "request"
        fields.setdefault(key, str(item.get("msg", "参数无效")))
    return error_response(400, "VALIDATION_ERROR", "请求数据校验失败", fields)


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        429: "RATE_LIMITED",
    }
    detail = exc.detail if isinstance(exc.detail, str) else "请求失败"
    code = code_map.get(exc.status_code, "HTTP_ERROR")
    return error_response(
        exc.status_code,
        code,
        detail,
        headers=dict(exc.headers) if exc.headers else None,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = current_request_id()
    logger.exception("Unhandled error request_id=%s path=%s", request_id, request.url.path)
    return error_response(500, "INTERNAL_ERROR", "服务器内部错误，请稍后重试")


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
