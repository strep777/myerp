"""Comprehensive end-to-end API test for Lager ERP.

Requires a running server with demo seed data. Uses unique master-data codes
so it can run repeatedly against the same database.
"""
from __future__ import annotations

import json
import random
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from typing import Any, Optional

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8011").rstrip("/")
API = BASE + "/api/v1"
SUFFIX = f"{int(time.time()) % 100000}{random.randint(10, 99)}"
results = []


class Client:
    def __init__(self) -> None:
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, method: str, path: str, body: Optional[dict] = None) -> tuple[int, Any, dict]:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(API + path, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with self.opener.open(req, timeout=30) as resp:
                raw = resp.read()
                ctype = resp.headers.get("content-type", "")
                if "application/json" in ctype and raw:
                    payload = json.loads(raw)
                elif "text/csv" in ctype:
                    payload = raw
                else:
                    payload = raw.decode("utf-8", "replace") if raw else None
                return resp.status, payload, dict(resp.headers)
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
    print(f"[{mark}] {name}" + ("" if condition else f" -> {detail!r}"))


def login(username: str, password: str) -> Client:
    client = Client()
    status, body, _ = client.request("POST", "/auth/login", {"username": username, "password": password})
    if status != 200:
        raise RuntimeError(f"login failed for {username}: {status} {body}")
    return client


def main() -> int:
    admin = login("admin", "Admin@12345")

    # ---------- master data ----------
    product_payload = {
        "sku": f"T-{SUFFIX}",
        "name": f"端到端测试商品 {SUFFIX}",
        "category": "测试分类",
        "spec": "1 件",
        "unit": "件",
        "safety_stock": 10,
        "reference_cost": 10,
        "reference_price": 20,
        "remark": "e2e",
    }
    status, product, _ = admin.request("POST", "/products", product_payload)
    check("create product", status == 201 and product.get("sku") == product_payload["sku"], (status, product))
    pid = product["id"]
    status, duplicate, _ = admin.request("POST", "/products", product_payload)
    check("duplicate sku rejected", status == 409, (status, duplicate))

    status, wh1, _ = admin.request(
        "POST", "/warehouses", {"code": f"W1{SUFFIX}"[-10:], "name": f"测试一号仓 {SUFFIX}", "location": "测试"}
    )
    check("create warehouse 1", status == 201, (status, wh1))
    status, wh2, _ = admin.request(
        "POST", "/warehouses", {"code": f"W2{SUFFIX}"[-10:], "name": f"测试二号仓 {SUFFIX}"}
    )
    check("create warehouse 2", status == 201, (status, wh2))
    w1, w2 = wh1["id"], wh2["id"]

    status, supplier, _ = admin.request(
        "POST", "/suppliers", {"code": f"S{SUFFIX}", "name": f"测试供应商 {SUFFIX}", "email": "supplier@example.com"}
    )
    check("create supplier", status == 201 and supplier.get("email") == "supplier@example.com", (status, supplier))
    status, customer, _ = admin.request(
        "POST", "/customers", {"code": f"C{SUFFIX}", "name": f"测试客户 {SUFFIX}"}
    )
    check("create customer", status == 201, (status, customer))
    sid, cid = supplier["id"], customer["id"]

    # ---------- inventory ----------
    status, adjustment, _ = admin.request(
        "POST", "/inventory/adjustments",
        {"product_id": pid, "warehouse_id": w1, "quantity_change": 100, "reason": "端到端期初"},
    )
    check("stock adjustment in", status == 200 and adjustment.get("quantity") == 100, (status, adjustment))

    status, balance, _ = admin.request("GET", f"/inventory/balances?warehouse_id={w1}&q={product_payload['sku']}")
    check("balance after adjustment", status == 200 and balance["items"][0]["quantity"] == 100, (status, balance))

    status, negative, _ = admin.request(
        "POST", "/inventory/adjustments",
        {"product_id": pid, "warehouse_id": w1, "quantity_change": -1000, "reason": "测试不足"},
    )
    check("negative stock rejected", status == 409 and negative.get("code") == "INSUFFICIENT_STOCK", (status, negative))

    # ---------- inbound ----------
    inbound_payload = {
        "supplier_id": sid,
        "warehouse_id": w1,
        "related_no": f"PO-{SUFFIX}",
        "lines": [{"product_id": pid, "quantity": 50, "unit_cost": 12, "remark": "首批"}],
    }
    status, inbound, _ = admin.request("POST", "/inbound-orders", inbound_payload)
    check("create inbound", status == 201 and inbound["status"] == "DRAFT" and inbound["total_amount"] == 600, (status, inbound))
    in_id = inbound["id"]

    status, updated, _ = admin.request(
        "PUT", f"/inbound-orders/{in_id}",
        {**inbound_payload, "remark": "修改备注", "lines": [{"product_id": pid, "quantity": 60, "unit_cost": 12}]},
    )
    check("update draft inbound", status == 200 and updated["total_quantity"] == 60, (status, updated))
    in_id = updated["id"]

    status, confirmed, _ = admin.request("POST", f"/inbound-orders/{in_id}/confirm")
    check("confirm inbound", status == 200 and confirmed["status"] == "CONFIRMED", (status, confirmed))
    status, again, _ = admin.request("POST", f"/inbound-orders/{in_id}/confirm")
    check("double confirm rejected", status == 409, (status, again))
    status, edit_confirmed, _ = admin.request("PUT", f"/inbound-orders/{in_id}", inbound_payload)
    check("confirmed inbound immutable", status == 409, (status, edit_confirmed))

    status, balance, _ = admin.request("GET", f"/inventory/balances?warehouse_id={w1}&q={product_payload['sku']}")
    item = balance["items"][0]
    check("inbound increases stock", item["quantity"] == 160, item)
    check("inbound sets average cost", abs(item["avg_cost"] - 4.5) < 1e-6, item)

    # weighted average
    status, inbound2, _ = admin.request(
        "POST", "/inbound-orders",
        {"supplier_id": sid, "warehouse_id": w1, "lines": [{"product_id": pid, "quantity": 40, "unit_cost": 18}]},
    )
    check("create second inbound", status == 201, (status, inbound2))
    admin.request("POST", f"/inbound-orders/{inbound2['id']}/confirm")
    status, balance, _ = admin.request("GET", f"/inventory/balances?warehouse_id={w1}&q={product_payload['sku']}")
    item = balance["items"][0]
    check("weighted average quantity", item["quantity"] == 200, item)
    check("weighted average cost", abs(item["avg_cost"] - 7.2) < 1e-6, item)

    # ---------- outbound ----------
    outbound_payload = {
        "customer_id": cid,
        "warehouse_id": w1,
        "related_no": f"SO-{SUFFIX}",
        "lines": [{"product_id": pid, "quantity": 20, "remark": "发货"}],
    }
    status, outbound, _ = admin.request("POST", "/outbound-orders", outbound_payload)
    check("create outbound", status == 201 and outbound["status"] == "DRAFT", (status, outbound))
    out_id = outbound["id"]
    status, confirmed, _ = admin.request("POST", f"/outbound-orders/{out_id}/confirm")
    check("confirm outbound", status == 200 and confirmed["status"] == "CONFIRMED", (status, confirmed))

    status, balance, _ = admin.request("GET", f"/inventory/balances?warehouse_id={w1}&q={product_payload['sku']}")
    item = balance["items"][0]
    check("outbound decreases stock", item["quantity"] == 180, item)
    check("outbound keeps average cost", abs(item["avg_cost"] - 7.2) < 1e-6, item)

    status, shortage, _ = admin.request(
        "POST", "/outbound-orders",
        {"warehouse_id": w1, "lines": [{"product_id": pid, "quantity": 999999}]},
    )
    check("create over-large outbound draft", status == 201, (status, shortage))
    status, failure, _ = admin.request("POST", f"/outbound-orders/{shortage['id']}/confirm")
    check("insufficient outbound rejected", status == 409 and failure.get("code") == "INSUFFICIENT_STOCK", (status, failure))
    check("insufficient has line detail", bool(failure.get("fields", {}).get("lines")), failure)
    admin.request("DELETE", f"/outbound-orders/{shortage['id']}")

    # ---------- transfer ----------
    transfer_payload = {
        "from_warehouse_id": w1,
        "to_warehouse_id": w2,
        "remark": "测试调拨",
        "lines": [{"product_id": pid, "quantity": 30, "remark": "移库"}],
    }
    status, transfer, _ = admin.request("POST", "/transfer-orders", transfer_payload)
    check("create transfer", status == 201 and transfer["status"] == "DRAFT", (status, transfer))
    tr_id = transfer["id"]
    status, confirmed, _ = admin.request("POST", f"/transfer-orders/{tr_id}/confirm")
    check("confirm transfer", status == 200 and confirmed["status"] == "CONFIRMED", (status, confirmed))

    status, b1, _ = admin.request("GET", f"/inventory/balances?warehouse_id={w1}&q={product_payload['sku']}")
    status, b2, _ = admin.request("GET", f"/inventory/balances?warehouse_id={w2}&q={product_payload['sku']}")
    check("transfer source decreases", b1["items"][0]["quantity"] == 150, b1)
    check("transfer destination increases", b2["items"][0]["quantity"] == 30, b2)
    check("transfer carries cost", abs(b2["items"][0]["avg_cost"] - 7.2) < 1e-6, b2)

    status, bad_transfer, _ = admin.request(
        "POST", "/transfer-orders",
        {"from_warehouse_id": w1, "to_warehouse_id": w1, "lines": [{"product_id": pid, "quantity": 1}]},
    )
    check("same warehouse transfer rejected", status == 400, (status, bad_transfer))

    # ---------- stocktake ----------
    status, stocktake, _ = admin.request("POST", "/stocktakes", {"warehouse_id": w2, "remark": "月末盘点"})
    check("create stocktake", status == 201 and stocktake["status"] == "DRAFT", (status, stocktake))
    st_id = stocktake["id"]
    status, ongoing, _ = admin.request("POST", "/stocktakes", {"warehouse_id": w2})
    check("ongoing stocktake rejected", status == 409 and ongoing.get("code") == "ONGOING_STOCKTAKE", (status, ongoing))

    line = next((l for l in stocktake["lines"] if l["product_id"] == pid), None)
    check("stocktake snapshot includes product", line is not None and line["book_quantity"] == 30, line)
    status, counting, _ = admin.request(
        "PUT", f"/stocktakes/{st_id}/lines",
        {"lines": [{"line_id": line["id"], "counted_quantity": 28, "remark": "盘亏 2"}]},
    )
    check("save stocktake count", status == 200 and counting["status"] == "COUNTING", (status, counting))
    status, completed, _ = admin.request("POST", f"/stocktakes/{st_id}/complete")
    check("complete stocktake", status == 200 and completed["status"] == "COMPLETED", (status, completed))

    status, b2, _ = admin.request("GET", f"/inventory/balances?warehouse_id={w2}&q={product_payload['sku']}")
    check("stocktake applies loss", b2["items"][0]["quantity"] == 28, b2)

    # stale stocktake
    status, stale_st, _ = admin.request("POST", "/stocktakes", {"warehouse_id": w2})
    check("create stale-test stocktake", status == 201, (status, stale_st))
    admin.request(
        "POST", "/inventory/adjustments",
        {"product_id": pid, "warehouse_id": w2, "quantity_change": 1, "reason": "盘点期间变动"},
    )
    status, stale, _ = admin.request("POST", f"/stocktakes/{stale_st['id']}/complete")
    check("stale stocktake rejected", status == 409 and stale.get("code") == "STOCKTAKE_STALE", (status, stale))
    admin.request("POST", f"/stocktakes/{stale_st['id']}/cancel")

    # ---------- reports ----------
    status, summary, _ = admin.request("GET", f"/reports/stock-summary?warehouse_id={w2}&q={product_payload['sku']}")
    check("stock report contains item", status == 200 and summary["total"] == 1 and summary["items"][0]["quantity"] == 29, (status, summary))

    status, flow, _ = admin.request("GET", f"/reports/flow-summary?warehouse_id={w1}&q={product_payload['sku']}")
    check("flow report", status == 200 and flow["items"][0]["inbound_qty"] == 100, (status, flow))

    status, csv_data, headers = admin.request("GET", "/reports/export/stock.csv?include_zero=false")
    check("CSV export", status == 200 and isinstance(csv_data, bytes) and csv_data.startswith(b"\xef\xbb\xbf"), (status, headers))
    disposition = next((v for k, v in headers.items() if k.lower() == "content-disposition"), "")
    check("CSV filename", "stock-" in disposition, disposition)

    # ---------- master data constraints ----------
    status, delete_in_use, _ = admin.request("DELETE", f"/products/{pid}")
    check("product in use cannot delete", status == 409, (status, delete_in_use))

    status, temp_wh, _ = admin.request("POST", "/warehouses", {"code": f"TMP{SUFFIX}"[-10:], "name": "临时仓"})
    check("create temp warehouse", status == 201, (status, temp_wh))
    status, _, _ = admin.request("DELETE", f"/warehouses/{temp_wh['id']}")
    check("delete unused warehouse", status == 204, status)

    # ---------- users & RBAC ----------
    operator_name = f"op{SUFFIX}"
    status, operator, _ = admin.request(
        "POST", "/users",
        {"username": operator_name, "display_name": "测试操作员", "password": "Operator@123", "role": "OPERATOR"},
    )
    check("create operator", status == 201 and operator["role"] == "OPERATOR", (status, operator))
    viewer_name = f"view{SUFFIX}"
    status, viewer, _ = admin.request(
        "POST", "/users",
        {"username": viewer_name, "display_name": "测试查看员", "password": "Viewer@12345", "role": "VIEWER"},
    )
    check("create viewer", status == 201, (status, viewer))

    op = login(operator_name, "Operator@123")
    status, _, _ = op.request("GET", "/products")
    check("operator can read master data", status == 200, status)
    status, denied, _ = op.request("POST", "/products", {"sku": f"OP{SUFFIX}", "name": "禁止创建"})
    check("operator cannot create product", status == 403, (status, denied))
    status, op_in, _ = op.request(
        "POST", "/inbound-orders",
        {"warehouse_id": w1, "lines": [{"product_id": pid, "quantity": 1, "unit_cost": 1}]},
    )
    check("operator can create inbound", status == 201, (status, op_in))
    op.request("DELETE", f"/inbound-orders/{op_in['id']}")

    view = login(viewer_name, "Viewer@12345")
    status, _, _ = view.request("GET", "/inventory/balances")
    check("viewer can read inventory", status == 200, status)
    status, denied, _ = view.request(
        "POST", "/inbound-orders", {"warehouse_id": w1, "lines": [{"product_id": pid, "quantity": 1}]}
    )
    check("viewer cannot write documents", status == 403, (status, denied))
    status, denied, _ = view.request("GET", "/users")
    check("viewer cannot list users", status == 403, (status, denied))

    # ---------- password change invalidates session ----------
    status, _, _ = op.request("POST", "/auth/change-password", {"old_password": "Operator@123", "new_password": "Operator@456"})
    check("change password", status == 204, status)
    status, _, _ = op.request("GET", "/auth/me")
    check("old token invalid after password change", status == 401, status)
    op2 = login(operator_name, "Operator@456")
    status, me, _ = op2.request("GET", "/auth/me")
    check("new password login", status == 200 and me["username"] == operator_name, (status, me))

    # ---------- coverage extension: reads, filters, updates, lifecycle ----------
    status, dash, _ = admin.request("GET", f"/dashboard/summary?warehouse_id={w1}")
    check("dashboard summary", status == 200 and {"total_quantity", "low_stock_count", "draft_documents"} <= set(dash), (status, dash))
    status, trend, _ = admin.request("GET", f"/dashboard/trend?days=7&warehouse_id={w1}")
    check("dashboard trend", status == 200 and len(trend["items"]) == 7, (status, trend))
    status, recent, _ = admin.request("GET", "/dashboard/recent-documents?limit=5")
    check("dashboard recent", status == 200 and len(recent["items"]) <= 5, (status, recent))
    status, low, _ = admin.request("GET", f"/dashboard/low-stock?limit=5&warehouse_id={w1}")
    check("dashboard low stock", status == 200 and "items" in low, (status, low))

    status, product_detail, _ = admin.request("GET", f"/products/{pid}")
    check("product detail", status == 200 and product_detail["id"] == pid, (status, product_detail))
    status, product_options, _ = admin.request("GET", f"/products/options?q={product_payload['sku']}&limit=10")
    check("product options", status == 200 and product_options[0]["id"] == pid, (status, product_options))
    status, updated_product, _ = admin.request("PATCH", f"/products/{pid}", {"remark": "e2e updated"})
    check("product update", status == 200 and updated_product["remark"] == "e2e updated", (status, updated_product))
    status, spare_product, _ = admin.request(
        "POST", "/products", {"sku": f"SP{SUFFIX}", "name": "临时商品", "unit": "件"}
    )
    check("create spare product", status == 201, (status, spare_product))
    status, _, _ = admin.request("DELETE", f"/products/{spare_product['id']}")
    check("delete unused product", status == 204, status)

    status, wh_detail, _ = admin.request("GET", f"/warehouses/{w1}")
    check("warehouse detail", status == 200 and wh_detail["id"] == w1, (status, wh_detail))
    status, wh_options, _ = admin.request("GET", "/warehouses/options?limit=10")
    check("warehouse options", status == 200 and len(wh_options) >= 2, (status, wh_options))
    status, updated_wh, _ = admin.request("PATCH", f"/warehouses/{w1}", {"manager": "测试负责人"})
    check("warehouse update", status == 200 and updated_wh["manager"] == "测试负责人", (status, updated_wh))

    status, supplier_detail, _ = admin.request("GET", f"/suppliers/{sid}")
    check("supplier detail", status == 200 and supplier_detail["id"] == sid, (status, supplier_detail))
    status, supplier_options, _ = admin.request("GET", "/suppliers/options?limit=10")
    check("supplier options", status == 200 and len(supplier_options) >= 1, (status, supplier_options))
    status, updated_supplier, _ = admin.request("PATCH", f"/suppliers/{sid}", {"phone": "021-12345678"})
    check("supplier update", status == 200 and updated_supplier["phone"] == "021-12345678", (status, updated_supplier))
    status, spare_supplier, _ = admin.request(
        "POST", "/suppliers", {"code": f"TS{SUFFIX}", "name": "临时供应商"}
    )
    check("create spare supplier", status == 201, (status, spare_supplier))
    status, _, _ = admin.request("DELETE", f"/suppliers/{spare_supplier['id']}")
    check("delete unused supplier", status == 204, status)

    status, customer_detail, _ = admin.request("GET", f"/customers/{cid}")
    check("customer detail", status == 200 and customer_detail["id"] == cid, (status, customer_detail))
    status, customer_options, _ = admin.request("GET", "/customers/options?limit=10")
    check("customer options", status == 200 and len(customer_options) >= 1, (status, customer_options))
    status, updated_customer, _ = admin.request("PATCH", f"/customers/{cid}", {"address": "测试地址 1 号"})
    check("customer update", status == 200 and updated_customer["address"] == "测试地址 1 号", (status, updated_customer))
    status, spare_customer, _ = admin.request(
        "POST", "/customers", {"code": f"TC{SUFFIX}", "name": "临时客户"}
    )
    check("create spare customer", status == 201, (status, spare_customer))
    status, _, _ = admin.request("DELETE", f"/customers/{spare_customer['id']}")
    check("delete unused customer", status == 204, status)

    status, users_page, _ = admin.request("GET", f"/users?q={SUFFIX}&page_size=10")
    check("user list", status == 200 and users_page["total"] >= 2, (status, users_page))
    status, user_detail, _ = admin.request("GET", f"/users/{viewer['id']}")
    check("user detail", status == 200 and user_detail["role"] == "VIEWER", (status, user_detail))
    status, user_updated, _ = admin.request("PATCH", f"/users/{viewer['id']}", {"display_name": "覆盖测试查看员"})
    check("user update", status == 200 and user_updated["display_name"] == "覆盖测试查看员", (status, user_updated))
    status, self_disable, _ = admin.request("PATCH", f"/users/{admin.request('GET', '/auth/me')[1]['id']}", {"is_active": False})
    check("cannot disable self", status == 409 and self_disable.get("code") == "SELF_DISABLE", (status, self_disable))
    status, last_admin, _ = admin.request("PATCH", f"/users/{admin.request('GET', '/auth/me')[1]['id']}", {"role": "VIEWER"})
    check("cannot demote last admin", status == 409 and last_admin.get("code") == "LAST_ADMIN", (status, last_admin))
    status, reset, _ = admin.request("POST", f"/users/{viewer['id']}/reset-password", {"new_password": "Viewer@67890"})
    check("reset user password", status == 204, status)
    status, _, _ = view.request("GET", "/auth/me")
    check("reset invalidates old token", status == 401, status)

    status, ledger_page, _ = admin.request(
        "GET", f"/inventory/ledger?product_id={pid}&warehouse_id={w1}&movement_type=INBOUND&page_size=5"
    )
    check("ledger filters", status == 200 and ledger_page["total"] >= 1, (status, ledger_page))
    status, overview, _ = admin.request("GET", f"/inventory/overview?warehouse_id={w1}")
    check("inventory overview", status == 200 and overview["sku_count"] >= 1, (status, overview))

    status, in_draft, _ = admin.request(
        "POST", "/inbound-orders",
        {"warehouse_id": w1, "related_no": f"COV-IN-{SUFFIX}", "lines": [{"product_id": pid, "quantity": 1, "unit_cost": 1}]},
    )
    status, in_updated, _ = admin.request(
        "PUT", f"/inbound-orders/{in_draft['id']}",
        {"warehouse_id": w1, "related_no": f"COV-IN-{SUFFIX}", "lines": [{"product_id": pid, "quantity": 2, "unit_cost": 1}]},
    )
    check("inbound draft update", status == 200 and in_updated["total_quantity"] == 2, (status, in_updated))
    status, in_cancel, _ = admin.request("POST", f"/inbound-orders/{in_draft['id']}/cancel")
    check("inbound cancel", status == 200 and in_cancel["status"] == "CANCELLED", (status, in_cancel))
    status, in_deleted, _ = admin.request("DELETE", f"/inbound-orders/{in_draft['id']}")
    check("cancelled inbound cannot delete", status == 409, (status, in_deleted))

    out_draft_payload = {
        "warehouse_id": w1,
        "related_no": f"COV-OUT-{SUFFIX}",
        "lines": [{"product_id": pid, "quantity": 1}],
    }
    status, out_draft, _ = admin.request("POST", "/outbound-orders", out_draft_payload)
    out_draft_payload["lines"][0]["quantity"] = 2
    status, out_updated, _ = admin.request("PUT", f"/outbound-orders/{out_draft['id']}", out_draft_payload)
    check("outbound draft update", status == 200 and out_updated["total_quantity"] == 2, (status, out_updated))
    status, out_cancel, _ = admin.request("POST", f"/outbound-orders/{out_draft['id']}/cancel")
    check("outbound cancel", status == 200 and out_cancel["status"] == "CANCELLED", (status, out_cancel))
    status, out_list, _ = admin.request("GET", f"/outbound-orders?status=CANCELLED&warehouse_id={w1}")
    check("outbound filter", status == 200 and out_list["total"] >= 1, (status, out_list))

    transfer_draft_payload = {
        "from_warehouse_id": w1,
        "to_warehouse_id": w2,
        "lines": [{"product_id": pid, "quantity": 1}],
    }
    status, tr_draft, _ = admin.request("POST", "/transfer-orders", transfer_draft_payload)
    transfer_draft_payload["lines"][0]["quantity"] = 2
    status, tr_updated, _ = admin.request("PUT", f"/transfer-orders/{tr_draft['id']}", transfer_draft_payload)
    check("transfer draft update", status == 200 and tr_updated["total_quantity"] == 2, (status, tr_updated))
    status, tr_cancel, _ = admin.request("POST", f"/transfer-orders/{tr_draft['id']}/cancel")
    check("transfer cancel", status == 200 and tr_cancel["status"] == "CANCELLED", (status, tr_cancel))
    status, tr_list, _ = admin.request("GET", f"/transfer-orders?status=CANCELLED&from_warehouse_id={w1}")
    check("transfer filter", status == 200 and tr_list["total"] >= 1, (status, tr_list))

    status, st_detail, _ = admin.request("GET", f"/stocktakes/{st_id}")
    check("stocktake detail", status == 200 and st_detail["status"] == "COMPLETED", (status, st_detail))
    status, st_list, _ = admin.request("GET", f"/stocktakes?status=COMPLETED&warehouse_id={w2}")
    check("stocktake filter", status == 200 and st_list["total"] >= 1, (status, st_list))
    status, st_temp, _ = admin.request("POST", "/stocktakes", {"warehouse_id": w1, "remark": "临时盘点"})
    check("create temp stocktake", status == 201, (status, st_temp))
    status, _, _ = admin.request("DELETE", f"/stocktakes/{st_temp['id']}")
    check("delete draft stocktake", status == 204, status)
    status, st_cancel_src, _ = admin.request("POST", "/stocktakes", {"warehouse_id": w1})
    status, st_cancelled, _ = admin.request("POST", f"/stocktakes/{st_cancel_src['id']}/cancel")
    check("cancel stocktake", status == 200 and st_cancelled["status"] == "CANCELLED", (status, st_cancelled))

    status, low_report, _ = admin.request("GET", f"/reports/low-stock?warehouse_id={w1}")
    check("low stock report", status == 200 and "items" in low_report, (status, low_report))
    status, ledger_report, _ = admin.request("GET", f"/reports/ledger?warehouse_id={w1}&page_size=5")
    check("ledger report", status == 200 and ledger_report["total"] >= 1, (status, ledger_report))
    status, flow_csv, flow_headers = admin.request("GET", "/reports/export/flow.csv?warehouse_id=" + str(w1))
    check("flow CSV", status == 200 and isinstance(flow_csv, bytes) and flow_csv.startswith(b"\xef\xbb\xbf"), (status, flow_headers))
    status, ledger_csv, ledger_headers = admin.request("GET", "/reports/export/ledger.csv?warehouse_id=" + str(w1))
    check("ledger CSV", status == 200 and isinstance(ledger_csv, bytes) and ledger_csv.startswith(b"\xef\xbb\xbf"), (status, ledger_headers))

    status, system_info, _ = admin.request("GET", "/system/info")
    check("system info", status == 200 and system_info["database"] == "sqlite", (status, system_info))
    status, health, _ = admin.request("GET", "/system/health")
    check("system health", status == 200 and health["status"] == "ok", (status, health))

    # ---------- coverage extension 2: filters, lifecycle guards, auth edges ----------
    status, wh_list, _ = admin.request("GET", f"/warehouses?q={wh1['code']}&is_active=true")
    check("warehouse list filter", status == 200 and wh_list["total"] >= 1, (status, wh_list))
    status, tmp_wh2, _ = admin.request("POST", "/warehouses", {"code": f"TW{SUFFIX}", "name": "临时启停仓"})
    status, wh_off, _ = admin.request("PATCH", f"/warehouses/{tmp_wh2['id']}", {"is_active": False})
    check("warehouse deactivate", status == 200 and wh_off["is_active"] is False, (status, wh_off))
    status, wh_on, _ = admin.request("PATCH", f"/warehouses/{tmp_wh2['id']}", {"is_active": True})
    check("warehouse reactivate", status == 200 and wh_on["is_active"] is True, (status, wh_on))
    status, _, _ = admin.request("DELETE", f"/warehouses/{tmp_wh2['id']}")
    check("delete temp warehouse 2", status == 204, status)
    status, wh_used, _ = admin.request("DELETE", f"/warehouses/{w2}")
    check("warehouse with stock cannot delete", status == 409, (status, wh_used))

    status, partner_list, _ = admin.request("GET", f"/suppliers?q={supplier['code']}&is_active=true")
    check("supplier list filter", status == 200 and partner_list["total"] >= 1, (status, partner_list))
    status, tmp_s2, _ = admin.request("POST", "/suppliers", {"code": f"TS2{SUFFIX}", "name": "临时启停供应商"})
    status, s_off, _ = admin.request("PATCH", f"/suppliers/{tmp_s2['id']}", {"is_active": False})
    check("supplier deactivate", status == 200 and s_off["is_active"] is False, (status, s_off))
    status, s_on, _ = admin.request("PATCH", f"/suppliers/{tmp_s2['id']}", {"is_active": True})
    check("supplier reactivate", status == 200 and s_on["is_active"] is True, (status, s_on))
    status, dup_partner, _ = admin.request("POST", "/suppliers", {"code": supplier["code"], "name": "重复供应商"})
    check("duplicate supplier code rejected", status == 409, (status, dup_partner))
    status, _, _ = admin.request("DELETE", f"/suppliers/{tmp_s2['id']}")
    check("delete temp supplier 2", status == 204, status)
    status, cust_in_use, _ = admin.request("DELETE", f"/customers/{cid}")
    check("customer with orders cannot delete", status == 409, (status, cust_in_use))

    status, in_list, _ = admin.request(
        "GET", f"/inbound-orders?status=CANCELLED&warehouse_id={w1}"
    )
    check("inbound filter list", status == 200 and in_list["total"] >= 1, (status, in_list))
    status, in_detail, _ = admin.request("GET", f"/inbound-orders/{in_draft['id']}")
    check("cancelled inbound detail", status == 200 and in_detail["status"] == "CANCELLED", (status, in_detail))
    status, guard, _ = admin.request(
        "PUT", f"/inbound-orders/{in_draft['id']}",
        {"warehouse_id": w1, "lines": [{"product_id": pid, "quantity": 1, "unit_cost": 1}]},
    )
    check("cancelled inbound cannot edit", status == 409, (status, guard))
    status, guard, _ = admin.request("POST", f"/inbound-orders/{in_draft['id']}/confirm")
    check("cancelled inbound cannot confirm", status == 409, (status, guard))
    status, guard, _ = admin.request("DELETE", f"/inbound-orders/{in_draft['id']}")
    check("cancelled inbound delete guard", status == 409, (status, guard))

    status, tr_draft2, _ = admin.request(
        "POST", "/transfer-orders",
        {"from_warehouse_id": w1, "to_warehouse_id": w2, "lines": [{"product_id": pid, "quantity": 999999}]},
    )
    check("create oversized transfer", status == 201, (status, tr_draft2))
    status, tr_insufficient, _ = admin.request("POST", f"/transfer-orders/{tr_draft2['id']}/confirm")
    check("transfer insufficient stock", status == 409 and tr_insufficient.get("code") == "INSUFFICIENT_STOCK", (status, tr_insufficient))
    status, tr_detail, _ = admin.request("GET", f"/transfer-orders/{tr_draft2['id']}")
    check("transfer detail", status == 200 and tr_detail["id"] == tr_draft2["id"], (status, tr_detail))
    status, tr_guard, _ = admin.request("PUT", f"/transfer-orders/{tr_draft2['id']}", {"from_warehouse_id": w1, "to_warehouse_id": w2, "lines": []})
    check("transfer invalid update rejected", status == 400, (status, tr_guard))
    status, _, _ = admin.request("DELETE", f"/transfer-orders/{tr_draft2['id']}")
    check("delete transfer draft", status == 204, status)

    status, weak, _ = admin.request(
        "POST", "/users",
        {"username": f"weak{SUFFIX}", "display_name": "弱密码", "password": "short", "role": "VIEWER"},
    )
    check("weak password rejected", status == 400, (status, weak))
    status, duplicate_user, _ = admin.request(
        "POST", "/users",
        {"username": operator_name, "display_name": "重复", "password": "Duplicate@123", "role": "VIEWER"},
    )
    check("duplicate username rejected", status == 409, (status, duplicate_user))
    admin.request("PATCH", f"/users/{viewer['id']}", {"is_active": False})
    inactive_client = Client()
    status, _, _ = inactive_client.request("POST", "/auth/login", {"username": viewer_name, "password": "Viewer@67890"})
    check("inactive user cannot log in", status == 401, status)
    status, _, _ = admin.request("PATCH", f"/users/{viewer['id']}", {"is_active": True})
    check("reactivate user", status == 200, status)
    status, logout_client, _ = admin.request("GET", "/auth/me")
    tmp_session = login(operator_name, "Operator@456")
    status, _, _ = tmp_session.request("POST", "/auth/logout")
    check("logout", status == 204, status)
    status, _, _ = tmp_session.request("GET", "/auth/me")
    check("logout invalidates session", status == 401, status)

    anon = Client()
    status, _, _ = anon.request("POST", "/auth/login", {"username": f"nosuch{SUFFIX}", "password": "Whatever@123"})
    check("unknown user login rejected", status == 401, status)
    status, _, _ = anon.request("POST", "/auth/login", {"username": operator_name, "password": "Wrong@12345"})
    check("wrong password rejected", status == 401, status)
    op3 = login(operator_name, "Operator@456")
    status, bad_old, _ = op3.request(
        "POST", "/auth/change-password", {"old_password": "Wrong@12345", "new_password": "Operator@789"}
    )
    check("wrong current password rejected", status == 400 and bad_old.get("code") == "INVALID_PASSWORD", (status, bad_old))
    status, same, _ = op3.request(
        "POST", "/auth/change-password", {"old_password": "Operator@456", "new_password": "Operator@456"}
    )
    check("same password rejected", status == 400 and same.get("code") == "SAME_PASSWORD", (status, same))
    status, weak_change, _ = op3.request(
        "POST", "/auth/change-password", {"old_password": "Operator@456", "new_password": "abcdefgh"}
    )
    check("weak new password rejected", status == 400 and weak_change.get("code") == "WEAK_PASSWORD", (status, weak_change))

    # ---------- audit ----------
    status, audits, _ = admin.request("GET", f"/audit-logs?q={SUFFIX}&page_size=100")
    check("audit records", status == 200 and audits["total"] > 0, (status, audits))
    actions = {item["action"] for item in audits.get("items", [])}
    check("audit has stock actions", {"ADJUST", "CONFIRM", "COMPLETE"} & actions, actions)

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("\nFailed checks:")
        for name, _, detail in failed:
            print(f"- {name}: {detail!r}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
