"""End-to-end checks for the v1.1 AI inbound workflow.

The script is intentionally self-contained: it starts a local mock provider,
configures the running Lager server to use it, creates a temporary product,
runs analyze -> import, and verifies stock and token handling.

Usage:
    python scripts/ai_e2e_test.py http://127.0.0.1:8014 --db data/ai-e2e.db
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import httpx

RESULTS: list[tuple[str, bool, Any]] = []


def check(name: str, condition: bool, detail: Any = "") -> None:
    RESULTS.append((name, bool(condition), detail))
    print(f"[{'PASS' if condition else 'FAIL'}] {name}" + ("" if condition else f" -> {detail!r}"))


def error_code(response: httpx.Response) -> str:
    try:
        return str(response.json().get("code", ""))
    except Exception:
        return ""


class MockProvider(BaseHTTPRequestHandler):
    requests: list[dict[str, Any]] = []
    preview: dict[str, Any] = {}

    def log_message(self, *args: Any) -> None:  # keep test output clean
        return

    def _json(self, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        self.requests.append({"method": "GET", "path": self.path})
        if self.path.endswith("/api/tags"):
            self._json({"models": [{"name": "qwen3.5:9b"}]})
        else:
            self.send_error(404)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {}
        self.requests.append({"method": "POST", "path": self.path, "body": body})
        if self.path.endswith("/api/chat"):
            self._json(
                {
                    "message": {"content": "```json\n" + json.dumps(self.preview, ensure_ascii=False) + "\n```"},
                    "prompt_eval_count": 100,
                    "eval_count": 50,
                }
            )
        elif self.path.endswith("/chat/completions"):
            self._json(
                {
                    "choices": [{"message": {"content": json.dumps(self.preview, ensure_ascii=False)}}],
                    "usage": {"prompt_tokens": 20, "completion_tokens": 40},
                }
            )
        else:
            self.send_error(404)


def start_mock() -> tuple[ThreadingHTTPServer, str, MockProvider]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockProvider)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{server.server_port}", MockProvider


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base", nargs="?", default="http://127.0.0.1:8014")
    parser.add_argument("--db", default="data/ai-e2e.db")
    args = parser.parse_args()
    base = args.base.rstrip("/")

    mock, provider_url, mock_cls = start_mock()
    client = httpx.Client(base_url=base + "/api/v1", trust_env=False, timeout=120)
    suffix = f"{int(time.time()) % 100000}{random.randint(10, 99)}"
    sku = f"AI-T-{suffix}"

    try:
        status = client.post("/auth/login", json={"username": "admin", "password": "Admin@12345"}).status_code
        check("admin login", status == 200, status)
        settings = client.get("/ai/settings")
        check("AI settings readable", settings.status_code == 200, settings.text[:200])
        default_prompt = settings.json()["default_prompt"]
        check("default skill prompt present", len(default_prompt) > 1500, len(default_prompt))

        warehouses = client.get("/warehouses/options", params={"limit": 50}).json()
        check("warehouse options", bool(warehouses), warehouses)
        warehouse_id = int(warehouses[0]["id"])

        product = client.post(
            "/products",
            json={
                "sku": sku,
                "name": f"AI 联调商品 {suffix}",
                "category": "AI 测试",
                "spec": "1 件",
                "unit": "件",
                "safety_stock": 1,
                "reference_cost": 10,
                "reference_price": 18,
                "remark": "ai e2e",
            },
        )
        check("temporary product created", product.status_code == 201, product.text[:300])
        product_id = product.json()["id"]

        before = client.get("/inventory/balances", params={"q": sku, "warehouse_id": warehouse_id, "page_size": 10}).json()
        before_qty = sum(float(item["quantity"]) for item in before["items"])
        check("opening stock is zero", before_qty == 0, before_qty)

        mock_cls.preview = {
            "source_summary": "AI 自动化测试采购单 · 1 项",
            "supplier_name": "AI 测试供应商",
            "order_date": "2026-11-09",
            "related_no": "PO-AI-E2E",
            "items": [
                {
                    "sku": sku,
                    "name": f"AI 联调商品 {suffix}",
                    "spec": "1 件",
                    "category": "AI 测试",
                    "unit": "件",
                    "barcode": "",
                    "quantity": 3,
                    "unit_cost": 12.5,
                    "reference_price": 18,
                    "confidence": 0.97,
                }
            ],
            "warnings": ["mock 数据"],
        }

        put = client.put(
            "/ai/settings",
            json={
                "provider": "ollama",
                "ollama_base_url": provider_url,
                "ollama_model": "qwen3.5:9b",
                "default_prompt": "你是仓储入库助手。只输出 JSON。",
                "auto_confirm": True,
            },
        )
        check("provider setting accepts lowercase", put.status_code == 200 and put.json()["provider"] == "OLLAMA", put.text[:200])
        probe = client.post("/ai/settings/test", json={"provider": "OLLAMA"})
        check("Ollama connection test", probe.status_code == 200 and probe.json().get("ok") is True, probe.text[:200])

        empty = client.post("/ai/analyze", data={"text": ""})
        check("empty source rejected", empty.status_code == 400 and error_code(empty) == "AI_SOURCE_EMPTY", empty.text[:200])
        ssrf = client.post("/ai/analyze", data={"link": "http://127.0.0.1:8000/"})
        check("private link rejected", ssrf.status_code == 400 and error_code(ssrf) == "AI_PRIVATE_URL", ssrf.text[:200])
        bad_scheme = client.post("/ai/analyze", data={"link": "file:///etc/passwd"})
        check("file scheme rejected", bad_scheme.status_code == 400 and error_code(bad_scheme) == "AI_INVALID_URL", bad_scheme.text[:200])

        analyze = client.post("/ai/analyze", data={"text": "采购 AI 联调商品 3 件，单价 12.5 元"})
        check("text analyze", analyze.status_code == 200, analyze.text[:400])
        analysis = analyze.json()
        token = analysis.get("token", "")
        check("preview has one editable line", len(analysis.get("items", [])) == 1, analysis.get("items"))
        line = (analysis.get("items") or [{}])[0]
        check("existing SKU matched", line.get("matched_product_id") == product_id and line.get("match_type") == "existing", line)
        check("preview token issued", len(token) > 20, token)

        time.sleep(0.1)
        with sqlite3.connect(args.db) as db:
            row = db.execute("SELECT token_hash FROM ai_runs WHERE created_by = 1 ORDER BY id DESC LIMIT 1").fetchone()
        expected = hashlib.sha256(token.encode()).hexdigest()
        check("raw token is not stored", bool(row) and row[0] == expected and row[0] != token, row)

        imported = client.post(
            "/ai/import",
            json={
                "token": token,
                "warehouse_id": warehouse_id,
                "supplier_name": "AI 测试供应商",
                "create_supplier": True,
                "related_no": "PO-AI-E2E",
                "remark": "AI 自动化验收",
                "expected_date": "2026-11-09",
                "auto_confirm": True,
                "lines": [
                    {
                        "product_id": product_id,
                        "sku": sku,
                        "name": f"AI 联调商品 {suffix}",
                        "spec": "1 件",
                        "category": "AI 测试",
                        "unit": "件",
                        "barcode": "",
                        "quantity": 3,
                        "unit_cost": 12.5,
                        "reference_price": 18,
                    }
                ],
            },
        )
        check("AI import succeeds", imported.status_code == 200, imported.text[:400])
        result = imported.json()
        check("AI import creates confirmed order", result.get("auto_confirmed") is True and result.get("status") == "CONFIRMED", result)
        check("AI import total matches", float(result.get("total_quantity", 0)) == 3 and float(result.get("total_amount", 0)) == 37.5, result)
        check("AI import matched existing product", result.get("matched_products") == 1 and result.get("created_products") == [], result)

        after = client.get("/inventory/balances", params={"q": sku, "warehouse_id": warehouse_id, "page_size": 10}).json()
        after_qty = sum(float(item["quantity"]) for item in after["items"])
        check("stock increased by three", after_qty == 3, after_qty)

        replay = client.post(
            "/ai/import",
            json={
                "token": token,
                "warehouse_id": warehouse_id,
                "create_supplier": False,
                "auto_confirm": True,
                "lines": [{"product_id": product_id, "name": f"AI 联调商品 {suffix}", "quantity": 3, "unit_cost": 12.5}],
            },
        )
        check("preview token is single-use", replay.status_code == 409 and error_code(replay) == "AI_PREVIEW_USED", replay.text[:200])
        missing = client.post("/ai/import", json={"token": "x" * 43, "warehouse_id": warehouse_id, "auto_confirm": True, "lines": [{"product_id": product_id, "name": "x", "quantity": 1}]})
        check("unknown token rejected", missing.status_code == 404 and error_code(missing) == "AI_PREVIEW_NOT_FOUND", missing.text[:200])

        key = "sk-e2e-secret-1234567890"
        deepseek = client.put(
            "/ai/settings",
            json={
                "provider": "DEEPSEEK",
                "deepseek_base_url": provider_url,
                "deepseek_model": "deepseek-flash",
                "deepseek_api_key": key,
                "default_prompt": default_prompt,
                "auto_confirm": True,
            },
        )
        check("DeepSeek key saved", deepseek.status_code == 200 and deepseek.json()["deepseek_api_key_set"] is True, deepseek.text[:300])
        safe = client.get("/ai/settings")
        serialized = safe.text
        check("key never returned", key not in serialized and safe.json().get("deepseek_api_key_hint"), serialized[:300])

        with sqlite3.connect(args.db) as db:
            encrypted = db.execute("SELECT deepseek_api_key_enc FROM ai_settings WHERE id = 1").fetchone()[0]
        check("key encrypted at rest", bool(encrypted) and key not in encrypted and encrypted.startswith("gAAAA"), encrypted[:20])
        check("DeepSeek connection test", client.post("/ai/settings/test", json={"provider": "DEEPSEEK"}).status_code == 200)

        image = b"\x89PNG\r\n\x1a\n" + b"0" * 64
        image_analysis = client.post(
            "/ai/analyze",
            files={"image": ("receipt.png", image, "image/png")},
            data={"text": "截图采购"},
        )
        check("image analyze", image_analysis.status_code == 200, image_analysis.text[:300])
        deepseek_calls = [r for r in mock_cls.requests if r["path"].endswith("/chat/completions")]
        content = deepseek_calls[-1]["body"]["messages"][-1]["content"] if deepseek_calls else []
        check("image sent as content part", isinstance(content, list) and any(part.get("type") == "image_url" for part in content), content)

    finally:
        mock.shutdown()
        client.close()

    failed = [item for item in RESULTS if not item[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} AI CHECKS PASSED")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
