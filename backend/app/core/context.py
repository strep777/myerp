from __future__ import annotations

from contextvars import ContextVar


request_id_var: ContextVar[str] = ContextVar("request_id", default="")
request_ip_var: ContextVar[str] = ContextVar("request_ip", default="")
request_path_var: ContextVar[str] = ContextVar("request_path", default="")


def current_request_id() -> str:
    return request_id_var.get()


def current_request_ip() -> str:
    return request_ip_var.get()
