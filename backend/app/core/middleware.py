from __future__ import annotations

import logging
import re
import time
import uuid
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.context import (
    request_id_var,
    request_ip_var,
    request_path_var,
)
from app.core.errors import error_content


logger = logging.getLogger("lager.request")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def _client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return ""


def _security_headers(path: str, request_id: str) -> dict:
    return {
        "X-Request-ID": request_id,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
        "X-Permitted-Cross-Domain-Policies": "none",
        "Content-Security-Policy": _csp_for(path),
    }


def _csp_for(path: str) -> str:
    if path.startswith("/api/docs") or path == "/api/openapi.json":
        return (
            "default-src 'self' https://cdn.jsdelivr.net; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: https://fastapi.tiangolo.com; "
            "font-src 'self' data: https://cdn.jsdelivr.net; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
    if path.startswith("/api/"):
        return "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    return (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "object-src 'none'; frame-ancestors 'none'; "
        "base-uri 'self'; form-action 'self'"
    )


def register_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_middleware(request: Request, call_next: Callable):
        started = time.perf_counter()
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        ip = _client_ip(request)
        rid_token = request_id_var.set(request_id)
        ip_token = request_ip_var.set(ip)
        path_token = request_path_var.set(request.url.path)
        request.state.request_id = request_id
        request.state.client_ip = ip

        try:
            content_length = request.headers.get("content-length")
            max_bytes = (
                settings.ai_max_request_bytes
                if request.url.path == "/api/v1/ai/analyze"
                else settings.max_request_bytes
            )
            if content_length:
                try:
                    too_large = int(content_length) > max_bytes
                except ValueError:
                    too_large = True
                if too_large:
                    return JSONResponse(
                        status_code=413,
                        content=error_content(
                            "PAYLOAD_TOO_LARGE",
                            f"请求体不能超过 {max_bytes // 1024} KB",
                        ),
                        headers=_security_headers(request.url.path, request_id),
                    )

            try:
                response = await call_next(request)
            except Exception:
                logger.exception(
                    "Unhandled request error request_id=%s path=%s",
                    request_id,
                    request.url.path,
                )
                response = JSONResponse(
                    status_code=500,
                    content=error_content(
                        "INTERNAL_ERROR", "服务器内部错误，请稍后重试"
                    ),
                )

            path = request.url.path
            for header, value in _security_headers(path, request_id).items():
                response.headers[header] = value
            if settings.cookie_secure:
                response.headers["Strict-Transport-Security"] = (
                    "max-age=31536000; includeSubDomains"
                )

            if path.startswith("/assets/"):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            elif path.startswith("/api/"):
                response.headers["Cache-Control"] = "no-store"
            elif response.headers.get("content-type", "").startswith("text/html"):
                response.headers["Cache-Control"] = "no-cache"

            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "%s %s %s %.1fms request_id=%s",
                request.method,
                path,
                response.status_code,
                elapsed_ms,
                request_id,
            )
            return response
        finally:
            request_path_var.reset(path_token)
            request_ip_var.reset(ip_token)
            request_id_var.reset(rid_token)
