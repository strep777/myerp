"""End-to-end HTTP smoke test for the Lager ERP API.

Run against a live server:
    python scripts/smoke_test.py http://127.0.0.1:8011
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from typing import Any, Optional

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8011").rstrip("/")
API = BASE + "/api/v1"
jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
results = []


def call(method: str, path: str, body: Optional[dict] = None) -> tuple[int, Any, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=20) as resp:
            raw = resp.read()
            headers = dict(resp.headers)
            payload = json.loads(raw) if raw and "json" in resp.headers.get("content-type", "") else raw
            return resp.status, payload, headers
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw.decode("utf-8", "replace")
        return exc.code, payload, dict(exc.headers)


def check(name: str, condition: bool, detail: Any = "") -> None:
    results.append((name, condition, detail))
    mark = "PASS" if condition else "FAIL"
    print(f"[{mark}] {name}" + ("" if condition else f" -> {detail}"))


def main() -> int:
    status, body, _ = call("GET", "/system/health")
    check("health", status == 200 and body.get("status") == "ok", (status, body))

    status, body, _ = call("GET", "/products")
    check("anonymous blocked", status == 401, (status, body))

    status, body, _ = call("POST", "/auth/login", {"username": "admin", "password": "wrong"})
    check("wrong password rejected", status == 401, (status, body))

    status, body, _ = call("POST", "/auth/login", {"username": "admin", "password": "Admin@12345"})
    check("admin login", status == 200 and body.get("username") == "admin", (status, body))

    status, body, _ = call("GET", "/auth/me")
    check("me", status == 200 and body.get("role") == "ADMIN", (status, body))

    status, products, _ = call("GET", "/products?page_size=100")
    check("product list", status == 200 and products.get("total", 0) >= 8, (status, products))
    product = products["items"][0]

    status, warehouses, _ = call("GET", "/warehouses/options")
    check("warehouse options", status == 200 and len(warehouses) >= 2, (status, warehouses))
    warehouse = warehouses[0]

    status, suppliers, _ = call("GET", "/suppliers/options")
    check("supplier options", status == 200 and len(suppliers) >= 2, (status, suppliers))

    status, dashboard, _ = call("GET", "/dashboard/summary")
    check("dashboard summary", status == 200 and "total_value" in dashboard, (status, dashboard))

    status, balances, _ = call("GET", "/inventory/balances?page_size=100")
    check("inventory balances", status == 200 and balances.get("total", 0) > 0, (status, balances))

    status, ledger, _ = call("GET", "/inventory/ledger?page_size=10")
    check("inventory ledger", status == 200 and ledger.get("total", 0) > 0, (status, ledger))

    status, overview, _ = call("GET", "/inventory/overview")
    check("inventory overview", status == 200 and "total_value" in overview, (status, overview))

    status, report, _ = call("GET", "/reports/stock-summary?page_size=10")
    check("stock report", status == 200 and "total_value" in report, (status, report))

    status, flow, _ = call("GET", "/reports/flow-summary")
    check("flow report", status == 200 and "items" in flow, (status, flow))

    status, audit, _ = call("GET", "/audit-logs?page_size=10")
    check("audit list", status == 200 and audit.get("total", 0) >= 2, (status, audit))

    status, users, _ = call("GET", "/users")
    check("user list", status == 200 and users.get("total", 0) >= 1, (status, users))

    status, info, _ = call("GET", "/system/info")
    check("system info", status == 200 and info.get("database") == "sqlite", (status, info))

    status, body, _ = call("GET", "/reports/export/stock.csv")
    check("stock csv", status == 200 and body.startswith(b"\xef\xbb\xbf"), (status, body[:80] if isinstance(body, bytes) else body))

    status, body, _ = call("POST", "/auth/logout")
    check("logout", status == 204, (status, body))

    status, body, _ = call("GET", "/auth/me")
    check("session invalid after logout", status == 401, (status, body))

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
