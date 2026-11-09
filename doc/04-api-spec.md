# Lager 仓储 · API 规范

版本：1.1  
基础路径：`/api/v1`  
格式：JSON，UTF-8；AI 分析使用 multipart/form-data  
认证：HttpOnly Cookie `lager_session`（JWT）  
关联：[架构](02-architecture.md)、[数据模型](03-data-model.md)、[安全](06-security.md)

## 1. 通用约定

### 1.1 请求

- `Content-Type: application/json`（文件导出、AI 图片/链接分析除外）。
- 所有写请求必须已登录；Cookie 由浏览器自动携带，前端 `fetch` 使用 `credentials: "include"`。
- 分页参数：`page` 默认 1，`page_size` 默认 20，最大 100。
- 排序：列表默认按 `created_at DESC, id DESC`；需要时通过 `sort` 指定白名单字段。
- 日期筛选：`date_from`、`date_to` 为 `YYYY-MM-DD`，按配置时区 `APP_TIMEZONE`（默认 `Asia/Shanghai`）解释，闭区间。
- 幂等：确认/取消接口重复调用返回 409，不产生二次库存变动。

### 1.2 成功响应

- 创建：`201` + 资源对象。
- 更新/确认/取消：`200` + 资源对象。
- 删除：`204` 无响应体。
- 列表：`200` + 分页对象。

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20,
  "pages": 0
}
```

### 1.3 错误响应

```json
{
  "detail": "库存不足，无法确认出库单",
  "code": "INSUFFICIENT_STOCK",
  "fields": {
    "lines": [
      {"product_id": 3, "sku": "SKU-003", "requested": 10, "available": 4}
    ]
  },
  "request_id": "0f8c2a1e..."
}
```

| HTTP | code | 说明 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 业务校验失败，`fields` 给出字段 |
| 401 | `UNAUTHORIZED` | 未登录/会话过期 |
| 403 | `FORBIDDEN` | 权限不足 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 唯一键冲突、重复确认、状态不允许 |
| 409 | `INSUFFICIENT_STOCK` | 库存不足，整单未确认 |
| 409 | `LAST_ADMIN` | 不能停用/降级最后一个管理员 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过限制（普通 1 MB，AI 分析 6 MB） |
| 429 | `RATE_LIMITED` | 登录尝试过多 |
| 500 | `INTERNAL_ERROR` | 服务器错误，附带 request_id |

### 1.4 权限缩写

- `A` = ADMIN
- `M` = MANAGER
- `O` = OPERATOR
- `V` = VIEWER
- `any` = 已登录即可

## 2. 认证 `/auth`

### 2.1 登录

`POST /auth/login` · 公开 · 限流

```json
{"username": "admin", "password": "Admin@12345"}
```

`200`：

```json
{
  "id": 1,
  "username": "admin",
  "display_name": "系统管理员",
  "role": "ADMIN",
  "is_active": true,
  "must_change_password": true
}
```

响应头：`Set-Cookie: lager_session=...; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`。  
错误：401 `UNAUTHORIZED`；429 `RATE_LIMITED`。

### 2.2 当前用户

`GET /auth/me` · any

`200` 同登录响应；未登录 401。

### 2.3 登出

`POST /auth/logout` · any · `204`，清除 Cookie，`token_version += 1` 使旧令牌立即失效，写审计。

### 2.4 修改密码

`POST /auth/change-password` · any

```json
{"old_password": "Admin@12345", "new_password": "NewPass@2026"}
```

`204`，`token_version += 1` 并清除 Cookie，要求重新登录。  
规则：新密码 8–64 位，至少包含字母和数字；不得与旧密码相同。

## 3. 用户 `/users` · ADMIN

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/users` | 列表，`q`、`role`、`is_active`、分页 |
| POST | `/users` | 创建 |
| PATCH | `/users/{id}` | 修改显示名、角色、启用状态 |
| POST | `/users/{id}/reset-password` | 重置密码 |

创建：

```json
{"username": "wang", "display_name": "王仓管", "password": "User@12345", "role": "OPERATOR"}
```

规则：
- 用户名唯一，3–50 位 `[A-Za-z0-9_]`。
- 密码 8–64 位，含字母和数字。
- 不能停用自己；不能停用/降级最后一个启用 ADMIN（409 `LAST_ADMIN`）。
- 用户响应永不含 `password_hash`。

用户对象：

```json
{"id": 2, "username": "wang", "display_name": "王仓管", "role": "OPERATOR",
 "is_active": true, "must_change_password": false, "created_at": "2026-11-08T12:00:00Z"}
```

## 4. 商品 `/products`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/products` | any | 列表，`q`（SKU/名称/条码）、`category`、`is_active`、分页 |
| GET | `/products/options` | any | 选择器，`q`、`limit<=50`，仅启用 |
| GET | `/products/{id}` | any | 详情 |
| POST | `/products` | A/M | 创建 |
| PATCH | `/products/{id}` | A/M | 修改（含停用） |
| POST | `/products/{id}/clear-stock` | A/M | 清空该商品全部仓库库存，写 ADJUSTMENT 流水，商品保留 |
| DELETE | `/products/{id}` | A/M | 删除商品并级联清除其库存余额/流水；被历史单据行引用时 409 |

商品对象：

```json
{
  "id": 3, "sku": "SKU-003", "name": "A4 复印纸", "category": "办公耗材",
  "spec": "70g / 500张", "unit": "包", "barcode": "6901234567890",
  "safety_stock": 20, "reference_cost": 18.5, "reference_price": 25,
  "remark": "", "is_active": true,
  "created_at": "2026-11-08T12:00:00Z", "updated_at": "2026-11-08T12:00:00Z"
}
```

清空库存响应：

```json
{"product_id": 3, "cleared_warehouses": 2, "cleared_quantity": 45.0}
```

规则：
- `sku` 唯一，自动去空格转大写；2–50 位。
- `safety_stock >= 0`，`reference_cost >= 0`。
- 停用不影响历史单据；停用商品不能用于新单据。
- 清空库存按仓库逐笔写 ADJUSTMENT 流水，原因固定为“商品页面清空库存”，商品档案保留。
- 删除商品会显式删除该商品全部 `inventory_balances` 与 `inventory_ledger`，审计记录清空数量；只要存在历史单据行引用，返回 409 `PRODUCT_IN_USE`，避免单据行失去商品。

## 5. 仓库 `/warehouses`

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/warehouses` | any |
| GET | `/warehouses/options` | any |
| GET | `/warehouses/{id}` | any |
| POST | `/warehouses` | A/M |
| PATCH | `/warehouses/{id}` | A/M |
| DELETE | `/warehouses/{id}` | A/M |

仓库对象：`{id, code, name, location, manager, remark, is_active, created_at, updated_at}`。  
规则：`code` 唯一；停用前余额必须全为 0；至少保留一个启用仓库；无库存且无单据引用允许删除。

## 6. 供应商 `/suppliers`、客户 `/customers`

两套结构对称：

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/suppliers` | any |
| GET | `/suppliers/options` | any |
| GET | `/suppliers/{id}` | any |
| POST | `/suppliers` | A/M |
| PATCH | `/suppliers/{id}` | A/M |
| DELETE | `/suppliers/{id}` | A/M |
| GET | `/customers` … | 同上 |

对象：`{id, code, name, contact_person, phone, email, address, remark, is_active, created_at, updated_at}`。  
`code` 唯一；`email` 为空或合法邮箱；`phone` 最长 40；被单据引用时不可删除，只能停用。

## 7. 库存 `/inventory`

### 7.1 库存余额列表

`GET /inventory/balances` · any

| 参数 | 类型 | 说明 |
|---|---|---|
| `warehouse_id` | int? | 仓库过滤 |
| `q` | str? | SKU/名称 |
| `category` | str? | 分类 |
| `low_stock` | bool? | 仅低于安全库存 |
| `include_zero` | bool? | 默认 false，是否含零库存 |
| `page` / `page_size` | int | 分页 |

响应项：

```json
{
  "product_id": 3, "sku": "SKU-003", "product_name": "A4 复印纸",
  "unit": "包", "category": "办公耗材", "warehouse_id": 1, "warehouse_name": "上海主仓",
  "quantity": 120, "avg_cost": 18.5, "stock_value": 2220,
  "safety_stock": 20, "is_low": false, "updated_at": "2026-11-08T12:00:00Z"
}
```

### 7.2 库存流水

`GET /inventory/ledger` · any

参数：`product_id`、`warehouse_id`、`movement_type`、`date_from`、`date_to`、`ref_no`、分页。

响应项：

```json
{
  "id": 88, "product_id": 3, "sku": "SKU-003", "product_name": "A4 复印纸",
  "warehouse_id": 1, "warehouse_name": "上海主仓",
  "movement_type": "INBOUND", "change_qty": 100, "unit_cost": 18.5,
  "balance_after": 120, "ref_type": "INBOUND", "ref_id": 12,
  "ref_no": "IN-20261108-0001", "remark": "", "created_by_name": "系统管理员",
  "created_at": "2026-11-08T12:00:00Z"
}
```

### 7.3 库存调整

`POST /inventory/adjustments` · A/M

> 当前界面不再在“库存余额”页提供入口；库存管理统一由商品页的“清空库存”触发，本接口保留用于内部调用与兼容。

```json
{
  "product_id": 3,
  "warehouse_id": 1,
  "quantity_change": -2,
  "reason": "破损报废"
}
```

`200` 返回调整后余额。规则：
- `quantity_change != 0`，最多 4 位小数；负数不能使库存小于 0。
- `reason` 必填 2–120 字。
- 写流水 `ADJUSTMENT`，`ref_type=ADJUST`，`ref_no=ADJ-{id}`；审计 `ADJUST`。

### 7.4 库存概览

`GET /inventory/overview?warehouse_id=` · any

```json
{"sku_count": 42, "total_quantity": 1830, "total_value": 52030.5, "low_stock_count": 3, "warehouse_count": 2}
```

## 8. 入库单 `/inbound-orders`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/inbound-orders` | any | `status`、`warehouse_id`、`supplier_id`、`q`、日期、分页 |
| POST | `/inbound-orders` | A/M/O | 创建草稿 |
| GET | `/inbound-orders/{id}` | any | 详情含明细 |
| PUT | `/inbound-orders/{id}` | A/M/O | 整体更新草稿 |
| DELETE | `/inbound-orders/{id}` | A/M/O | 删除草稿，204 |
| POST | `/inbound-orders/{id}/confirm` | A/M/O | 确认入库 |
| POST | `/inbound-orders/{id}/cancel` | A/M/O | 取消草稿 |

创建/更新请求：

```json
{
  "supplier_id": 1,
  "warehouse_id": 1,
  "related_no": "PO-2026-1024",
  "expected_date": "2026-11-10",
  "remark": "十月办公用品到货",
  "lines": [
    {"product_id": 3, "quantity": 100, "unit_cost": 18.5, "remark": ""},
    {"product_id": 4, "quantity": 50, "unit_cost": 7.2, "remark": "赠品"}
  ]
}
```

详情响应：

```json
{
  "id": 12, "order_no": "IN-20261108-0001", "status": "DRAFT",
  "supplier_id": 1, "supplier_name": "晨光文具", "warehouse_id": 1, "warehouse_name": "上海主仓",
  "related_no": "PO-2026-1024", "expected_date": "2026-11-10",
  "remark": "十月办公用品到货", "total_quantity": 150, "total_amount": 2210,
  "created_by": 1, "created_by_name": "系统管理员",
  "confirmed_by": null, "confirmed_by_name": null, "confirmed_at": null,
  "created_at": "2026-11-08T12:00:00Z", "updated_at": "2026-11-08T12:00:00Z",
  "lines": [
    {"id": 21, "product_id": 3, "sku": "SKU-003", "product_name": "A4 复印纸",
     "unit": "包", "quantity": 100, "unit_cost": 18.5, "amount": 1850, "remark": ""}
  ]
}
```

规则：
- 至少 1 行，最多 200 行；同一商品不可重复（409/400）。
- `quantity > 0`，最多 4 位小数；`unit_cost >= 0`。
- 仓库/商品/供应商必须启用（历史详情可显示停用）。
- 只有 DRAFT 可编辑/删除；确认后 409。
- 确认时同事务写余额与流水，重算 `avg_cost`；返回确认后详情。
- `total_amount` 服务端计算，忽略客户端传值。

## 9. 出库单 `/outbound-orders`

结构同入库，字段差异：

```json
{
  "customer_id": 2,
  "warehouse_id": 1,
  "related_no": "SO-2026-0088",
  "expected_date": "2026-11-12",
  "remark": "门店补货",
  "lines": [{"product_id": 3, "quantity": 20, "remark": ""}]
}
```

详情包含 `customer_name`、`total_quantity`；不含金额（成本在确认时按账面平均成本记账）。  
确认时逐行校验可用量，任一不足整单失败，`409 INSUFFICIENT_STOCK`，`fields.lines` 列出请求量与可用量。  
其余状态规则同入库。

## 10. 调拨单 `/transfer-orders`

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/transfer-orders` | any |
| POST | `/transfer-orders` | A/M/O |
| GET | `/transfer-orders/{id}` | any |
| PUT | `/transfer-orders/{id}` | A/M/O |
| DELETE | `/transfer-orders/{id}` | A/M/O |
| POST | `/transfer-orders/{id}/confirm` | A/M/O |
| POST | `/transfer-orders/{id}/cancel` | A/M/O |

请求：

```json
{
  "from_warehouse_id": 1,
  "to_warehouse_id": 2,
  "remark": "调拨至北京仓",
  "lines": [{"product_id": 3, "quantity": 30, "remark": ""}]
}
```

规则：源仓≠目标仓；确认时源仓扣减、目标仓按源仓平均成本入库；源仓不足整单失败；同一事务写两条流水。

## 11. 盘点单 `/stocktakes`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/stocktakes` | any | 列表 |
| POST | `/stocktakes` | A/M/O | 创建并快照账面 |
| GET | `/stocktakes/{id}` | any | 详情 |
| PUT | `/stocktakes/{id}/lines` | A/M/O | 批量保存实盘数 |
| POST | `/stocktakes/{id}/complete` | A/M/O | 完成盘点并入账 |
| POST | `/stocktakes/{id}/cancel` | A/M/O | 取消 |
| DELETE | `/stocktakes/{id}` | A/M/O | 删除草稿，204 |

创建：

```json
{"warehouse_id": 1, "remark": "月末盘点"}
```

服务端快照该仓库**全部启用商品**（无余额行的账面为 0），生成 `book_quantity`，并将 `counted_quantity` 默认设为账面数。若该仓库已有 DRAFT/COUNTING 盘点，返回 409 `ONGOING_STOCKTAKE`；无启用商品返回 409 `EMPTY_STOCKTAKE`。

保存实盘：

```json
{
  "lines": [
    {"line_id": 31, "counted_quantity": 118, "remark": "破损 2 包"},
    {"line_id": 32, "counted_quantity": 0, "remark": "盘亏"}
  ]
}
```

规则：
- `counted_quantity >= 0`，最多 4 位小数；可分批保存；保存后状态从 DRAFT→COUNTING。
- 实盘数创建时默认等于账面；用户只需修改有差异的行；允许零差异完成。
- 完成时按 `counted - book` 写盘盈/盘亏流水，更新余额；同一事务；状态 COMPLETED。
- 完成后不可修改；取消仅 DRAFT/COUNTING 且未入账。

详情项：

```json
{"id": 31, "product_id": 3, "sku": "SKU-003", "product_name": "A4 复印纸",
 "unit": "包", "book_quantity": 120, "counted_quantity": 118,
 "difference_quantity": -2, "remark": "破损 2 包"}
```

## 12. 报表 `/reports` · any

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/reports/stock-summary` | 库存汇总（同 balances，含金额） |
| GET | `/reports/low-stock` | 低库存清单 |
| GET | `/reports/ledger` | 流水明细 |
| GET | `/reports/flow-summary` | 收发存汇总 |
| GET | `/reports/export/stock.csv` | 库存 CSV |
| GET | `/reports/export/ledger.csv` | 流水 CSV |
| GET | `/reports/export/flow.csv` | 收发存 CSV |

`flow-summary` 参数：`date_from`、`date_to`（必填，默认本月）、`warehouse_id`、`category`、`q`。  
响应项：

```json
{
  "product_id": 3, "sku": "SKU-003", "product_name": "A4 复印纸", "unit": "包",
  "opening_qty": 20, "inbound_qty": 100, "outbound_qty": 0,
  "adjust_qty": 0, "closing_qty": 120, "closing_value": 2220
}
```

口径：
- `opening_qty` = 期间开始前最后一条流水的 `balance_after`（无则 0）。
- `inbound_qty` = 期间 `INBOUND + TRANSFER_IN` 之和。
- `outbound_qty` = 期间 `OUTBOUND + TRANSFER_OUT` 之和。
- `adjust_qty` = 盘点与调整的净额（`STOCKTAKE_GAIN + STOCKTAKE_LOSS + ADJUSTMENT`，正负相加）。
- `closing_qty` = opening + inbound − outbound + adjust。
- 调拨按仓库分别统计，源仓计 outbound，目标仓计 inbound。

CSV：`text/csv; charset=utf-8`，带 UTF-8 BOM 以兼容 Excel；文件名 `stock-YYYYMMDD.csv`。最多导出 50,000 行，超出 400 `EXPORT_TOO_LARGE`。

## 13. 工作台 `/dashboard` · any

`GET /dashboard/summary?warehouse_id=`：

```json
{
  "product_count": 42, "warehouse_count": 2, "total_quantity": 1830,
  "total_value": 52030.5, "low_stock_count": 3,
  "draft_documents": 4, "today_inbound": 2, "today_outbound": 1
}
```

`GET /dashboard/trend?days=7`：`{"items":[{"date":"2026-11-02","inbound_qty":120,"outbound_qty":30}]}`，`days` 7/30。

`GET /dashboard/recent-documents?limit=5`：

```json
{"items":[
  {"type":"INBOUND","id":12,"no":"IN-20261108-0001","status":"CONFIRMED",
   "warehouse_name":"上海主仓","quantity":150,"created_at":"..."}
]}
```

`GET /dashboard/low-stock?limit=5`：返回余额项（同 7.1）。

## 14. 审计 `/audit-logs` · A/M

`GET /audit-logs?user_id=&action=&entity_type=&date_from=&date_to=&q=&page=`

响应项：

```json
{"id": 301, "user_id": 1, "username": "admin", "action": "CONFIRM",
 "entity_type": "inbound_order", "entity_id": 12, "entity_no": "IN-20261108-0001",
 "summary": "确认入库单 IN-20261108-0001", "ip": "172.18.0.1",
 "created_at": "2026-11-08T12:00:00Z"}
```

`detail` 字段仅详情接口返回；列表不返回，避免体积。v1 不提供单条详情路由，列表含摘要即可；如需排查，数据库可查。

## 15. AI `/ai` · A/M/O（设置仅 A）

### 15.1 读取/保存设置

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/ai/settings` | A | 读取提供商、模型、提示词、掩码 |
| PUT | `/ai/settings` | A | 保存设置；Key 只写不回显 |
| POST | `/ai/settings/test` | A | 测试 DeepSeek 或 Ollama 连接；Ollama 返回可用模型列表 |
| GET | `/ai/ollama/models?base_url=` | A | 实时读取 Ollama `/api/tags` 模型列表，供设置页选择 |

```json
{
  "provider": "DEEPSEEK",
  "deepseek_base_url": "https://api.deepseek.com",
  "deepseek_model": "deepseek-flash",
  "deepseek_api_key": "sk-…",
  "clear_deepseek_api_key": false,
  "ollama_base_url": "http://127.0.0.1:11434",
  "ollama_model": "qwen3.5:9b",
  "default_prompt": "…",
  "auto_confirm": true
}
```

`provider` 大小写不敏感。`deepseek_api_key` 省略/空字符串表示不修改；`clear_deepseek_api_key=true` 清除。响应只回 `deepseek_api_key_set` 与 `deepseek_api_key_hint`。

连接测试请求可只传 `{"provider":"OLLAMA"}` 使用已保存配置，也可临时传地址/模型/Key；不会保存。Ollama 测试响应的 `models` 为当前 `/api/tags` 的实时列表；`model_available=false` 表示连接成功但标签不存在，`message` 会列出可用模型，不应把它误报成网络故障。

`GET /ai/ollama/models` 返回：

```json
{
  "base_url": "http://127.0.0.1:11434",
  "models": [
    {"name": "qwen3:8b", "size": 5230000000, "modified_at": "2026-11-09T...", "details": {"parameter_size": "8B"}}
  ]
}
```

设置页不再内置固定模型清单；当前保存的标签不在列表中时显示“未在列表”提示，用户可刷新或手填。该接口只读，不修改设置。

### 15.2 分析 `POST /ai/analyze`

`Content-Type: multipart/form-data`，请求体上限 **6 MB**（其他接口仍 1 MB）；图片文件 ≤4 MB（base64 后约 5.3 MB）。字段 `image` / `link` / `text` 至少一个，`provider` 可选（覆盖设置中的提供商）。

```json
{
  "token": "一次性预览令牌",
  "source_type": "IMAGE",
  "source_summary": "京东订单截图",
  "provider": "DEEPSEEK",
  "model": "deepseek-flash",
  "prompt_version": "lager-ai-inbound-v1",
  "latency_ms": 1840,
  "supplier_name": "京东自营",
  "order_date": "2026-11-09",
  "related_no": "JD-202611090001",
  "items": [
    {
      "sku": "ELC-001", "name": "USB-C 数据线 1m", "spec": "1 米",
      "category": "电子配件", "unit": "条", "barcode": "",
      "quantity": 2, "unit_cost": 16, "reference_price": 29,
      "confidence": 0.92, "matched_product_id": 3,
      "matched_product_name": "USB-C 数据线 1m",
      "match_type": "existing", "warnings": []
    }
  ],
  "warnings": []
}
```

规则：最多 50 行；`quantity` >0 且 ≤1e9；金额 ≥0 且 ≤1e12；不合法/超限由服务端裁剪或拒绝；图片魔数校验；链接抓取有 SSRF 防护。预览 token 只存 SHA-256，30 分钟过期，只能导入一次。

### 15.3 导入 `POST /ai/import`

```json
{
  "token": "…",
  "warehouse_id": 1,
  "supplier_id": null,
  "supplier_name": "京东自营",
  "create_supplier": true,
  "related_no": "JD-202611090001",
  "remark": "AI 识别，已人工核对",
  "expected_date": "2026-11-09",
  "auto_confirm": true,
  "lines": [
    {"product_id": 3, "sku": "ELC-001", "name": "USB-C 数据线 1m",
     "spec": "1 米", "quantity": 2, "unit_cost": 16}
  ]
}
```

响应：`order_id`、`order_no`、`status`、`created_products`、`matched_products`、`total_quantity`、`total_amount`、`auto_confirmed`、`message`。  
服务端会重新匹配/创建商品，不信任前端的 `matched_product_id`；失败不写库存。`auto_confirm=false` 时只生成草稿。

### 15.4 AI 错误码

| HTTP | code | 场景 |
|---:|---|---|
| 400 | `AI_SOURCE_EMPTY` | 三个来源都为空 |
| 400 | `AI_PROVIDER_INVALID` | provider 不是 DEEPSEEK/OLLAMA |
| 400 | `AI_INVALID_URL` / `AI_PRIVATE_URL` | 链接非法或指向内网 |
| 400 | `AI_LINK_FETCH_FAILED` / `AI_LINK_EMPTY` / `AI_SOURCE_TOO_LARGE` | 抓取失败/空正文/超限 |
| 400 | `AI_IMAGE_INVALID` / `AI_IMAGE_TOO_LARGE` | 图片格式/大小错误 |
| 400 | `AI_NOT_CONFIGURED` / `AI_BAD_RESPONSE` | 未配置或模型输出非法 |
| 502 | `AI_AUTH_FAILED` | 上游 401/403（服务端 Key 配置问题） |
| 404 | `AI_PREVIEW_NOT_FOUND` | 令牌不存在/不属于当前用户 |
| 409 | `AI_PREVIEW_USED` / `AI_PREVIEW_EXPIRED` / `AI_PREVIEW_INVALID` | 重复/过期/状态不可用 |
| 409 | `AI_IMPORT_CONFIRM_FAILED` | 草稿已建但确认失败 |
| 429 | `AI_RATE_LIMITED` | 上游限流 |
| 502 | `AI_PROVIDER_ERROR` / `AI_NETWORK_ERROR` / `AI_MODEL_NOT_FOUND` | 上游错误 |
| 504 | `AI_TIMEOUT` | 上游超时 |

## 16. 系统 `/system`

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/system/health` | 公开 | `{"status":"ok","time":"...","version":"1.1.0"}` |
| GET | `/system/info` | any | `{"name":"Lager 仓储","version":"1.1.0","timezone":"Asia/Shanghai","database":"sqlite","user_count":3,"uptime_seconds":3600}` |

健康检查不查库（避免探针放大 IO）；数据库可用性由启动时初始化保证。

## 17. 前端错误处理约定

- 401：清除本地用户状态，跳转登录页，保留 `redirect`。
- 403：toast「没有权限执行此操作」。
- 409 `INSUFFICIENT_STOCK`：在表单顶部展示明细表，不关闭弹窗。
- 422/400：字段错误映射到表单项；无映射则 toast `detail`。
- 429：显示「尝试过多，请 15 分钟后再试」。
- 500：toast 带 `request_id`，提示联系管理员。
- 普通请求 20 秒超时，AI 分析 120 秒；超时提示检查网络或模型服务。

## 18. OpenAPI

FastAPI 自动生成 `/api/docs`（Swagger）与 `/api/openapi.json`；生产环境可通过 `ENABLE_DOCS=false` 关闭。前端类型以本文档为准，联调时对照 Swagger。
