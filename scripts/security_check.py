from __future__ import annotations

import http.client
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from urllib.parse import urlparse

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8011").rstrip("/")
PARSED_BASE = urlparse(BASE)
HOST = PARSED_BASE.hostname or "127.0.0.1"
PORT = PARSED_BASE.port or (443 if PARSED_BASE.scheme == "https" else 80)
results: list[dict] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append({"name": name, "ok": bool(condition), "detail": detail})
    print(f"[{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not condition:
        raise AssertionError(name)


class Client:
    def __init__(self) -> None:
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, method: str, path: str, payload=None, cookie: str | None = None, headers=None):
        data = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(BASE + path, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        if cookie:
            req.add_header("Cookie", cookie)
        try:
            with self.opener.open(req, timeout=20) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()

    def cookie_header(self) -> str:
        return "; ".join(f"{cookie.name}={cookie.value}" for cookie in self.jar)


def main() -> None:
    client = Client()

    status, headers, body = client.request("GET", "/api/v1/products")
    check("匿名访问受保护接口返回 401", status == 401 and b"password" not in body.lower(), f"status={status}")

    status, headers, body = client.request("GET", "/")
    csp = headers.get("Content-Security-Policy", "")
    check("首页 CSP 存在且禁止内联脚本", "default-src 'self'" in csp and "script-src 'self'" in csp, csp[:90])
    check("安全头 nosniff / frame deny / referrer", headers.get("X-Content-Type-Options") == "nosniff"
          and headers.get("X-Frame-Options") == "DENY"
          and headers.get("Referrer-Policy") == "no-referrer")

    status, headers, body = client.request("POST", "/api/v1/auth/login", {"username": "admin", "password": "Admin@12345"})
    set_cookie = headers.get("Set-Cookie", "")
    check("管理员登录成功", status == 200, f"status={status}")
    cookie_lower = set_cookie.lower()
    check("会话 Cookie HttpOnly + SameSite=Lax + Path=/",
          "httponly" in cookie_lower and "samesite=lax" in cookie_lower and "path=/" in cookie_lower,
          set_cookie[:120])
    check("本地 HTTP 下 Cookie 不误加 Secure", "Secure" not in set_cookie)

    jwt_value = re.search(r"lager_session=([^;]+)", set_cookie).group(1)
    parts = jwt_value.split(".")
    check("JWT 为三段式", len(parts) == 3)
    tampered_sig = ("A" if parts[2][0] != "A" else "B") + parts[2][1:]
    tampered = ".".join(parts[:2] + [tampered_sig])
    status, _, _ = Client().request("GET", "/api/v1/auth/me", cookie=f"lager_session={tampered}")
    check("篡改 JWT 签名被拒绝", status == 401, f"status={status}")

    status, _, body = client.request("GET", "/api/v1/products?q=" + urllib.parse.quote("' OR 1=1--"))
    check("搜索参数 SQL 注入无 500/泄露", status == 200 and b"sqlalchemy" not in body.lower(), f"status={status}")

    # Lockout is per IP + username, so this cannot lock the admin account.
    probe = "sec_probe_" + str(int(time.time()))
    statuses = []
    for _ in range(6):
        status, _, _ = Client().request(
            "POST", "/api/v1/auth/login", {"username": probe, "password": "WrongPass123"}
        )
        statuses.append(status)
    check("连续失败 5 次后触发 429", statuses[:5] == [401] * 5 and statuses[5] == 429, f"statuses={statuses}")

    # Oversized body: only the declared length is needed; server must reject before parsing.
    connection = http.client.HTTPConnection(HOST, PORT, timeout=20)
    connection.request(
        "POST",
        "/api/v1/auth/login",
        body=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": "1100000"},
    )
    response = connection.getresponse()
    oversized_status = response.status
    oversized_nosniff = response.getheader("X-Content-Type-Options")
    oversized_frame = response.getheader("X-Frame-Options")
    oversized_request_id = response.getheader("X-Request-ID")
    connection.close()
    check("请求体超过 1MB 返回 413", oversized_status == 413, f"status={oversized_status}")
    check(
        "413 响应仍包含安全头与请求 ID",
        oversized_nosniff == "nosniff"
        and oversized_frame == "DENY"
        and bool(oversized_request_id),
        f"request_id={oversized_request_id or ''}",
    )

    status, _, _ = client.request("GET", "/api/v1/system/info")
    check("登录后可访问系统信息", status == 200, f"status={status}")

    logout_cookie = client.cookie_header()
    status, _, _ = client.request("POST", "/api/v1/auth/logout")
    check("登出成功", status == 204, f"status={status}")
    status, _, _ = Client().request("GET", "/api/v1/auth/me", cookie=logout_cookie)
    check("登出后旧会话立即失效", status == 401, f"status={status}")

    serialized = json.dumps({"results": results, "passed": len(results)}, ensure_ascii=False, indent=2)
    with open("security-result.json", "w", encoding="utf-8") as handle:
        handle.write(serialized)
    print(f"\nALL {len(results)} SECURITY CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        with open("security-result.json", "w", encoding="utf-8") as handle:
            json.dump({"results": results, "error": str(error)}, handle, ensure_ascii=False, indent=2)
        print(f"SECURITY CHECK FAILED: {error}", file=sys.stderr)
        sys.exit(1)
