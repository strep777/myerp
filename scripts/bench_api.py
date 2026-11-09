"""Benchmark the running Lager API against the synthetic perf database.

Prerequisite: uvicorn on 127.0.0.1:8012 using F:/erp/data/perf.db.
Run:
    ..\\.venv\\Scripts\\python.exe ..\\scripts\\bench_api.py
"""

from __future__ import annotations

import concurrent.futures
import json
import statistics
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

BASE = "http://127.0.0.1:8012"
RESULT_PATH = Path(__file__).resolve().parents[1] / "doc" / "performance-raw.json"
PATH = "/api/v1"


def request(opener, method: str, url: str, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE + url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    started = time.perf_counter()
    try:
        with opener.open(req, timeout=60) as response:
            body = response.read()
            return response.status, body, (time.perf_counter() - started) * 1000
    except urllib.error.HTTPError as error:
        return error.code, error.read(), (time.perf_counter() - started) * 1000


def percentile(values, ratio):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * ratio))))
    return round(ordered[index], 1)


def summarize(name, samples, errors, extra=None):
    row = {
        "scenario": name,
        "count": len(samples),
        "errors": errors,
        "p50_ms": percentile(samples, 0.50),
        "p95_ms": percentile(samples, 0.95),
        "p99_ms": percentile(samples, 0.99),
        "max_ms": round(max(samples), 1) if samples else 0,
        "mean_ms": round(statistics.mean(samples), 1) if samples else 0,
    }
    if extra:
        row.update(extra)
    return row


def run_series(opener, name, path, iterations=40, check=None):
    samples = []
    errors = 0
    payload = None
    for index in range(iterations):
        status, body, elapsed = request(opener, "GET", PATH + path)
        if status != 200:
            errors += 1
            continue
        if check is not None:
            check(body)
        if index >= 5:
            samples.append(elapsed)
    return summarize(name, samples, errors)


def main():
    results = []
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    login_times = []
    login_errors = 0
    for index in range(15):
        status, body, elapsed = request(
            opener, "POST", PATH + "/auth/login", {"username": "admin", "password": "Admin@12345"}
        )
        if status != 200:
            login_errors += 1
        elif index >= 2:
            login_times.append(elapsed)
    results.append(summarize("登录（PBKDF2 600k）", login_times, login_errors))
    cookie = "; ".join(f"{item.name}={item.value}" for item in jar)

    endpoints = [
        ("商品列表 page=1 size=20", "/products?page=1&page_size=20&is_active=true"),
        ("商品搜索 q=PERF-009", "/products?page=1&page_size=20&q=PERF-009"),
        ("库存余额列表", "/inventory/balances?page=1&page_size=20"),
        ("库存流水筛选", "/inventory/ledger?page=1&page_size=20&movement_type=INBOUND"),
        ("入库单列表", "/inbound-orders?page=1&page_size=20"),
        ("工作台汇总", "/dashboard/summary"),
        ("工作台 30 天趋势", "/dashboard/trend?days=30"),
        ("报表库存汇总", "/reports/stock-summary?page=1&page_size=20"),
        ("审计日志列表", "/audit-logs?page=1&page_size=20"),
    ]
    for name, path in endpoints:
        iterations = 40 if "流水" not in name else 25
        results.append(run_series(opener, name, path, iterations=iterations))

    # Detail of an existing order
    status, body, _ = request(opener, "GET", PATH + "/inbound-orders?page=1&page_size=1")
    order_id = json.loads(body)["items"][0]["id"]
    results.append(
        run_series(opener, "入库单详情（200 行目标）", f"/inbound-orders/{order_id}", iterations=30)
    )

    # 200-line confirmation: create then confirm, measuring both phases.
    product_ids = []
    for page in (1, 2):
        status, body, _ = request(
            opener, "GET", PATH + f"/products?page={page}&page_size=100"
        )
        product_ids.extend(item["id"] for item in json.loads(body)["items"])
    status, body, elapsed = request(
        opener,
        "GET",
        PATH + "/warehouses/options",
    )
    warehouses = json.loads(body)
    create_payload = {
        "warehouse_id": warehouses[0]["id"],
        "related_no": "PERF-200L",
        "remark": "200 line benchmark",
        "lines": [
            {"product_id": product_id, "quantity": 1, "unit_cost": 10, "remark": ""}
            for product_id in product_ids
        ],
    }
    status, body, create_elapsed = request(
        opener, "POST", PATH + "/inbound-orders", create_payload
    )
    confirm_elapsed = 0.0
    confirm_status = status
    if status in (200, 201):
        order_id = json.loads(body)["id"]
        confirm_status, _, confirm_elapsed = request(
            opener, "POST", PATH + f"/inbound-orders/{order_id}/confirm"
        )
    results.append(
        summarize(
            "创建 200 行入库单",
            [create_elapsed] if status in (200, 201) else [],
            0 if status in (200, 201) else 1,
        )
    )
    results.append(
        summarize(
            "确认 200 行入库单",
            [confirm_elapsed] if confirm_status == 200 else [],
            0 if confirm_status == 200 else 1,
        )
    )

    # CSV export (10k stock rows)
    status, body, elapsed = request(opener, "GET", PATH + "/reports/export/stock.csv")
    results.append(
        summarize(
            "CSV 导出库存（1 万行）",
            [elapsed] if status == 200 else [],
            0 if status == 200 else 1,
            {"bytes": len(body)},
        )
    )

    # CSV export of a large ledger slice (target is under 5 s and cap 50k)
    status, body, elapsed = request(
        opener,
        "GET",
        PATH + "/reports/export/ledger.csv?date_from=2026-06-01&date_to=2026-11-09",
    )
    results.append(
        summarize(
            "CSV 导出流水（约 4.4 万行）",
            [elapsed] if status == 200 else [],
            0 if status == 200 else 1,
            {"bytes": len(body), "rows": body.count(b"\n") - 1, "status": status},
        )
    )

    # Concurrency: 10 threads x 20 product-list reads
    def worker(_):
        local = urllib.request.build_opener()
        req = urllib.request.Request(BASE + PATH + "/products?page=1&page_size=20")
        req.add_header("Cookie", cookie)
        req.add_header("Accept", "application/json")
        started = time.perf_counter()
        try:
            with local.open(req, timeout=60) as response:
                response.read()
                return response.status, (time.perf_counter() - started) * 1000
        except Exception:
            return 0, (time.perf_counter() - started) * 1000

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        outcomes = list(pool.map(worker, range(200)))
    concurrency_times = [elapsed for status, elapsed in outcomes if status == 200]
    concurrency_errors = sum(1 for status, _ in outcomes if status != 200)
    results.append(
        summarize(
            "并发 10 线程 × 20 商品列表",
            concurrency_times,
            concurrency_errors,
            {"requests": len(outcomes)},
        )
    )

    # Concurrency: 20 clients, half reads / half stock adjustments.
    def mixed_worker(index):
        local = urllib.request.build_opener()
        times = []
        errors = 0
        for step in range(10):
            if step % 2 == 0:
                req = urllib.request.Request(
                    BASE + PATH + "/products?page=1&page_size=20", method="GET"
                )
            else:
                body = json.dumps(
                    {
                        "product_id": product_ids[index % len(product_ids)],
                        "warehouse_id": warehouses[0]["id"],
                        "quantity_change": 1,
                        "reason": "mixed benchmark",
                    }
                ).encode()
                req = urllib.request.Request(
                    BASE + PATH + "/inventory/adjustments", data=body, method="POST"
                )
                req.add_header("Content-Type", "application/json")
            req.add_header("Cookie", cookie)
            req.add_header("Accept", "application/json")
            started = time.perf_counter()
            try:
                with local.open(req, timeout=60) as response:
                    response.read()
                    if response.status not in (200, 201):
                        errors += 1
                    times.append((time.perf_counter() - started) * 1000)
            except Exception:
                errors += 1
                times.append((time.perf_counter() - started) * 1000)
        return times, errors

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        mixed = list(pool.map(mixed_worker, range(20)))
    mixed_times = [value for times, _ in mixed for value in times]
    mixed_errors = sum(errors for _, errors in mixed)
    results.append(
        summarize(
            "并发 20 客户端混合读写（各 10 次）",
            mixed_times,
            mixed_errors,
            {"requests": len(mixed_times)},
        )
    )

    raw = {
        "base": BASE,
        "python": "3.9.1",
        "database": "F:/erp/data/perf.db (31.1 MB)",
        "data": {
            "products": 10000,
            "ledger": 100000,
            "documents": 9999,
            "audit": 30000,
        },
        "results": results,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    RESULT_PATH.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    for row in results:
        print(
            f"{row['scenario']}: p50={row['p50_ms']}ms p95={row['p95_ms']}ms "
            f"p99={row['p99_ms']}ms errors={row['errors']}"
        )
    print("RAW", RESULT_PATH)


if __name__ == "__main__":
    main()
