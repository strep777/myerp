# Lager 仓储 · 系统架构设计

版本：1.1  
日期：2026-11-09  
状态：设计冻结（v1.1 已实现）  
关联：[PRD](01-product-requirements.md)、[数据模型](03-data-model.md)、[API](04-api-spec.md)、[安全](06-security.md)、[性能](07-performance.md)

## 1. 架构目标

1. **模块可独立修改**：每个业务模块拥有自己的表、路由、校验、服务和页面；修改入库逻辑不应迫使修改出库或报表代码。
2. **简单可部署**：单仓库、单进程、单 SQLite 文件、单容器；不引入 Redis、消息队列、微服务。
3. **交易正确**：库存余额与流水在同一事务；重复确认幂等；库存不足整单回滚。
4. **安全默认**：Cookie 会话、后端 RBAC、参数化查询、审计、安全响应头。
5. **新手友好**：前端组件、文案、错误码集中管理；页面流程短。

## 2. 架构决策记录（ADR）

### ADR-001：模块化单体，而非微服务

**决定**：一个 FastAPI 应用，按业务域分包；一个 SQLite；一个前端 SPA。  
**理由**：目标用户为中小企业，单机部署；微服务会带来网关、服务发现、分布式事务、运维成本，与“一键启动、简单好用”直接冲突。模块边界通过包结构、服务接口和测试保障，而不是网络边界。  
**后果**：扩展时优先水平复制只读能力或迁移 PostgreSQL；不在 v1 做跨服务拆分。

### ADR-002：SQLite + WAL，单写者模型

**决定**：SQLite 作为唯一数据库，启用 WAL、外键、busy_timeout；写操作短事务。  
**理由**：零运维、单文件备份、足够支撑中小企业并发；避免数据库容器。  
**后果**：高并发写入（>50 写/秒持续）不适合；需要多实例时迁移 PostgreSQL。通过条件更新避免超卖。

### ADR-003：HttpOnly Cookie + JWT 会话

**决定**：登录成功写入 HttpOnly、SameSite=Lax Cookie，JWT 仅存 Cookie，不返回给 JS；前端通过 `/auth/me` 恢复会话。  
**理由**：避免 localStorage 令牌被 XSS 读取；同源部署下 CSRF 风险低。  
**后果**：跨域开发需 Vite 代理；生产必须 HTTPS（或明确内网风险）。退出清除 Cookie；停用用户在下一次请求即失效。

### ADR-004：单据确认后不可变

**决定**：DRAFT 可编辑/删除；CONFIRMED 只读；纠错通过库存调整或反向单据。  
**理由**：库存审计链完整，避免“改历史单据导致账实不符”。  
**后果**：用户体验上必须提供清晰确认弹窗和调整入口；不实现“反审核”。

### ADR-005：移动加权平均成本

**决定**：余额表保存 `quantity` 与 `avg_cost`；入库重算平均成本；出库/转出按当前平均成本记账。  
**理由**：比标准成本更接近实际，计算复杂度可控；无需逐批成本层。  
**后果**：负库存被禁止；盘盈按当前平均成本入账，盘亏按当前平均成本出账；极端并发下成本可能有小数误差，展示到 2 位。

### ADR-006：前后端分离开发、同源部署

**决定**：开发时 Vite 5173 代理 `/api` 到 FastAPI 8000；生产构建 `frontend/dist` 由 FastAPI 静态托管，SPA fallback 到 `index.html`。  
**理由**：开发体验好；生产只有一个容器、一个端口、无 CORS 复杂度。  
**后果**：Docker 镜像包含前端构建产物；Windows bat 使用已构建的 dist 或现场构建。

### ADR-007：UoW 由 FastAPI 依赖管理，服务内提交

**决定**：每个请求一个 SQLAlchemy Session；服务方法完成业务后显式 `commit`，异常 `rollback` 并由全局异常处理返回。  
**理由**：简单、可读；避免在路由层散落事务代码。  
**后果**：服务方法必须是事务边界；跨服务调用（如入库→库存）不能各自提前提交，库存服务只 `flush`，由单据服务统一提交。

## 3. 总体架构

```text
┌───────────────────────────────────────────────────────────────┐
│                        浏览器（SPA）                          │
│  React 18 + Vite + TypeScript + Tailwind + shadcn 风格组件     │
│  路由懒加载 · 统一 API Client · Auth Context · Toast           │
└──────────────────────────────┬────────────────────────────────┘
                               │ HTTPS / same-origin / HttpOnly Cookie
┌──────────────────────────────▼────────────────────────────────┐
│                       FastAPI 应用                            │
│  中间件：Request ID · 安全头 · GZip · CORS(开发) · 异常处理     │
│  依赖：Session · current_user · require_roles                  │
│                                                               │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐  │
│  │  auth   │ │  users  │ │ products │ │warehouse│ │partners│  │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └────┬────┘ └───┬────┘  │
│       │           │           │            │          │       │
│  ┌────▼───────────▼───────────▼────────────▼──────────▼────┐  │
│  │                共享核心 core（无业务依赖）                │  │
│  │  config · database · security · permissions · errors     │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                 │
│  ┌─────────────┐  ┌──────────▼────────┐  ┌─────────────────┐  │
│  │  inbound    │  │     inventory     │  │    outbound     │  │
│  │  transfer   │─▶│ 余额 · 流水 · 成本 │◀─│    stocktake    │  │
│  └──────┬──────┘  └──────────┬────────┘  └────────┬────────┘  │
│         │                    │                    │           │
│  ┌──────▼────────────────────▼────────────────────▼────────┐  │
│  │        reports / dashboard（只读查询层，不做写入）        │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                              │                                 │
│  ┌───────────────────────────▼──────────────────────────────┐  │
│  │       audit（横切审计）  ·  seed  ·  system              │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬────────────────────────────────┘
                               │ SQLAlchemy 2.x
┌──────────────────────────────▼────────────────────────────────┐
│                  SQLite（WAL / FK / busy_timeout）             │
│   data/lager.db（Docker 命名卷 lager_data）                    │
└───────────────────────────────────────────────────────────────┘
```

## 4. 后端模块与依赖规则

| 模块 | 拥有的表 | 对外服务 | 允许依赖 |
|---|---|---|---|
| `core` | — | 配置、Session、安全、错误、权限、中间件 | 无业务模块 |
| `users` | `users` | `get_by_username`、`create_user`、`authenticate`、`change_password` | core, audit |
| `auth` | — | 登录/登出/me/改密路由 | users, core |
| `products` | `products` | `get_active_product`、`list_options`、CRUD | core, audit |
| `warehouses` | `warehouses` | `get_active_warehouse`、CRUD | core, audit |
| `partners` | `suppliers`, `customers` | 供应商/客户 CRUD、引用校验 | core, audit |
| `inventory` | `inventory_balances`, `inventory_ledger` | **唯一写库存入口**：`apply_inbound/outbound/transfer/stocktake/adjust`；查询余额/流水/低库存/收发存 | core, products, warehouses, audit |
| `inbound` | `inbound_orders`, `inbound_lines` | 入库单 CRUD、确认、取消 | core, products, warehouses, partners, inventory, audit |
| `outbound` | `outbound_orders`, `outbound_lines` | 出库单 CRUD、确认、取消 | 同上 |
| `transfers` | `transfer_orders`, `transfer_lines` | 调拨单 CRUD、确认、取消 | core, products, warehouses, inventory, audit |
| `stocktakes` | `stocktakes`, `stocktake_lines` | 盘点创建/录入/确认/取消 | core, products, warehouses, inventory, audit |
| `reports` | —（只读） | 库存汇总、低库存、流水、收发存、CSV | inventory, products, warehouses |
| `dashboard` | —（只读） | KPI、趋势、低库存、最近单据 | inventory, reports, 单据模块的只读计数 |
| `ai` | `ai_settings`, `ai_runs` | 设置、密钥加解密、DeepSeek/Ollama 适配、链接抓取、分析预览、导入编排 | core, products, partners, inbound, inventory, audit |
| `audit` | `audit_logs` | `write_audit`、查询日志 | core |
| `system` | — | 健康检查、版本信息 | core |

**规则**

1. 只有 `inventory` 模块可以写 `inventory_balances` 与 `inventory_ledger`。其他模块必须调用其 service。
2. `inventory` 不反向依赖单据模块；它只接收 `movement_type/ref_type/ref_id/ref_no` 等值对象，保持低耦合。
3. 单据模块不得直接改对方的表。跨单据统计由只读查询层完成。
4. `reports`、`dashboard` 禁止写库；它们可以读取多个模块的表，这是分析层的明确例外。
5. 模块之间不导入对方的 `router`；只导入 `service` 或明确的 `schemas`。
6. 循环依赖通过“依赖方向向下”避免：单据 → 库存 → 主数据 → core；审计为叶子依赖。
7. `ai` 只通过 `inbound.service.create_order/confirm_order`、`inventory.service` 和主数据 service 产生业务写入，不直接写库存/单据表；不得被这些模块反向依赖。
8. `ai` 的 provider/link_fetcher 只做协议与抓取，权限、校验、审计在 service/router 层，便于独立替换模型。

## 5. 后端目录结构

```text
backend/
├─ requirements.txt
├─ requirements-dev.txt
├─ pytest.ini
├─ app/
│  ├─ __init__.py
│  ├─ main.py                    # 应用装配、中间件、静态资源、异常处理
│  ├─ seed.py                    # 幂等种子数据
│  ├─ core/
│  │  ├─ config.py               # 环境配置（pydantic-settings）
│  │  ├─ database.py             # Base、engine、SessionLocal、PRAGMA、init_db
│  │  ├─ security.py             # 密码哈希、JWT、Cookie 常量
│  │  ├─ deps.py                 # get_db、get_current_user、require_roles
│  │  ├─ permissions.py          # Role 枚举与权限矩阵
│  │  ├─ errors.py               # AppError、错误码、异常处理器
│  │  ├─ middleware.py           # Request ID、安全头、CORS
│  │  └─ pagination.py           # Page 参数与响应
│  ├─ modules/
│  │  ├─ registry.py             # 导入全部模型，保证 create_all 完整
│  │  ├─ users/{models,schemas,service,router}.py
│  │  ├─ auth/{schemas,service,router}.py
│  │  ├─ products/{models,schemas,service,router}.py
│  │  ├─ warehouses/{models,schemas,service,router}.py
│  │  ├─ partners/{models,schemas,service,router}.py
│  │  ├─ inventory/{models,schemas,service,router,queries}.py
│  │  ├─ inbound/{models,schemas,service,router}.py
│  │  ├─ outbound/{models,schemas,service,router}.py
│  │  ├─ transfers/{models,schemas,service,router}.py
│  │  ├─ stocktakes/{models,schemas,service,router}.py
│  │  ├─ reports/{schemas,service,router}.py
│  │  ├─ dashboard/{schemas,service,router}.py
│  │  ├─ audit/{models,schemas,service,router}.py
│  │  ├─ ai/{models,schemas,prompts,crypto,providers,link_fetcher,service,router}.py
│  │  └─ system/{schemas,router}.py
│  └─ tests/                     # 仅在后端全部功能完成后编写
├─ Dockerfile
└─ .dockerignore
```

## 6. 请求处理链

```text
HTTP 请求
 → RequestIDMiddleware（生成/透传 X-Request-ID）
 → SecurityHeadersMiddleware
 → CORS（仅开发环境）
 → GZip
 → FastAPI 路由
 → 依赖：get_db → current_user（读取 Cookie/JWT）
 → require_roles（写接口）
 → 路由参数校验（Pydantic）
 → service（业务规则 + 事务）
 → inventory service（库存写）
 → audit.write_audit（同事务）
 → commit
 → Pydantic 响应模型（隐藏敏感字段）
```

失败路径：

- 业务错误抛 `AppError`，全局处理器返回 `{detail, code, fields, request_id}`；不泄露堆栈。
- 未捕获异常记录日志 + request_id，返回 500 通用文案；调试模式才返回详情。
- 数据库 `IntegrityError` 转为 409 `CONFLICT`。

## 7. 鉴权与会话

- 登录：`POST /api/v1/auth/login` 校验用户名/密码；成功后签发 HS256 JWT（`sub=user_id`, `role`, `exp`），写入 `lager_session` Cookie。
- Cookie 属性：`HttpOnly`；`SameSite=Lax`；`Path=/`；`Max-Age=28800`；`Secure` 由 `COOKIE_SECURE` 控制。
- 请求依赖解析 Cookie → 查库确认用户仍存在且 `is_active`；角色以数据库当前值为准（角色变更/停用立即生效）。
- 登出：清除 Cookie；审计记录。
- 密码修改：验证旧密码 → 更新哈希 → 清除当前 Cookie 强制重新登录。
- 限流：进程内滑动窗口（IP+username），5 次失败/15 分钟 → 429；成功清零。容器单进程，符合当前架构。

## 8. 库存一致性设计

### 8.1 数据不变量

1. `inventory_balances.quantity >= 0`。
2. 每个 `(product_id, warehouse_id)` 最多一行余额。
3. 每条流水 `balance_after >= 0`，且 = 变动前数量 + `change_qty`。
4. 单据确认状态只允许 `DRAFT → CONFIRMED`，重复确认返回 409。
5. 单据确认后，明细、状态、合计不可更改。

### 8.2 确认流程（出库示例）

```text
service.confirm(order_id, user):
  1. SELECT 单据 WHERE id=? AND status='DRAFT'（无则 404/409）
  2. 校验明细非空、数量>0、商品/仓库仍启用
  3. 条件更新状态：UPDATE outbound_orders SET status='CONFIRMED'
       WHERE id=? AND status='DRAFT'；rowcount=0 → 409（幂等保护）
  4. 对每一行：
       a. 条件扣减：UPDATE inventory_balances
            SET quantity=quantity-:q, updated_at=:now
            WHERE product_id=:p AND warehouse_id=:w AND quantity>=:q
          rowcount=0 → 抛 InsufficientStock（整单回滚）
       b. 读取扣减后余额与 avg_cost
       c. 写 ledger（OUTBOUND, change_qty=-q, unit_cost=avg_cost, balance_after）
  5. 更新单据合计/确认人/确认时间
  6. 写审计日志
  7. commit
```

任何一步异常 → 全局处理器 rollback；已写状态/余额/流水全部回滚。SQLite 单写者 + 条件更新保证不会负库存；并发确认可能出现 `database is locked`，由客户端提示重试。

### 8.3 成本计算

入库（q>0，单位成本 c）：

```text
new_qty = old_qty + q
new_avg = (old_qty * old_avg + q * c) / new_qty   # 保留 4 位，展示 2 位
```

出库/转出：`unit_cost = old_avg`，数量减少，`avg_cost` 不变。  
调拨转入：`unit_cost = 源仓当前 avg_cost`，目标仓按入库公式与新成本重算平均成本。  
盘盈：按当前 `avg_cost` 入库；盘亏：按当前 `avg_cost` 出库；成本为 0 时允许，报表标注。  
库存调整：正数按当前 avg_cost 入库；负数按当前 avg_cost 出库。

## 9. 单据编号

格式：`{PREFIX}-{YYYYMMDD}-{4位序号}`，例如 `IN-20261108-0001`。

- 前缀：IN / OUT / TRF / STK。
- 序号按“前缀+日期”查询当日最大序号 +1，在事务内生成；单实例 + SQLite 写锁下足够。
- 数据库对单号加唯一约束；冲突时重试一次。

## 10. 错误码

| HTTP | code | 场景 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 字段校验失败 |
| 401 | `UNAUTHORIZED` | 未登录/会话失效 |
| 403 | `FORBIDDEN` | 角色不足 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 唯一键冲突/重复确认/状态不允许 |
| 409 | `INSUFFICIENT_STOCK` | 库存不足（fields 带明细） |
| 422 | `VALIDATION_ERROR` | Pydantic 请求体错误（统一转换） |
| 429 | `RATE_LIMITED` | 登录失败过多 |
| 500 | `INTERNAL_ERROR` | 未捕获异常 |

## 11. 前端架构

```text
frontend/
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.ts
├─ tsconfig.json
├─ components.json            # shadcn 配置（手工组件，无 CLI 运行时依赖）
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx                 # 路由 + AuthProvider + Toaster
│  ├─ index.css               # Tailwind + macOS tokens + 基础样式
│  ├─ lib/
│  │  ├─ api.ts               # 统一 fetch、错误解析、credentials
│  │  ├─ types.ts             # 与后端契约对应的类型
│  │  ├─ auth.tsx             # AuthContext、登录/登出/me
│  │  ├─ format.ts            # 金额/数量/日期格式化
│  │  ├─ constants.ts         # 角色、状态、导航
│  │  └─ utils.ts             # cn、防抖
│  ├─ components/
│  │  ├─ ui/                  # shadcn 风格基础组件
│  │  ├─ layout/              # AppShell、Sidebar、Topbar
│  │  └─ common/              # PageHeader、StatCard、StatusBadge、DataTable、Pagination、EmptyState、ConfirmDialog、ProductPicker、LineEditor
│  └─ features/
│     ├─ auth/LoginPage.tsx
│     ├─ dashboard/DashboardPage.tsx
│     ├─ products/ProductsPage.tsx
│     ├─ warehouses/WarehousesPage.tsx
│     ├─ partners/PartnersPage.tsx
│     ├─ inventory/InventoryPage.tsx
│     ├─ inbound/{InboundListPage,InboundFormPage,InboundDetailPage}.tsx
│     ├─ outbound/{...}
│     ├─ transfers/{...}
│     ├─ stocktakes/{...}
│     ├─ reports/ReportsPage.tsx
│     └─ system/{UsersPage,AuditLogsPage}.tsx
└─ dist/                       # 构建产物，供 Docker / Windows 启动
```

**前端规则**

- 组件不直接 `fetch`，统一用 `api`；错误 toast + 页面内提示。
- 服务端状态不做全局缓存框架；页面自管理 `loading/error/data`，通过 `useApi` 或局部 effect。简单、可预测。
- 列表筛选写入 URL query，刷新/分享保持状态。
- 所有写操作按钮有 loading 态，防双击；成功后刷新数据并关闭弹窗。
- 路由级 `React.lazy`，`Suspense` 骨架屏。
- 图标只用 lucide-react；不使用 emoji 当图标。
- 状态与角色颜色统一从 `constants.ts` 取，禁止页面硬编码。

## 12. 部署架构

```text
Ubuntu:
  docker compose up -d --build
    └─ lager 容器（非 root，8000）
         ├─ FastAPI + Uvicorn
         ├─ 静态 SPA（frontend/dist）
         └─ /app/data/lager.db ← volume lager_data

Windows:
  start.bat
    ├─ 检查 Python，创建 .venv
    ├─ pip install -r backend/requirements.txt
    ├─ 若无 frontend/dist 且存在 Node，则构建；否则提示
    ├─ 设置 DATABASE_URL=sqlite:///F:\erp\data\lager.db
    ├─ uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
    └─ 打开 http://127.0.0.1:8000
```

**容器安全**：多阶段构建；运行阶段仅复制 venv/依赖与代码；`USER lager`；`read_only: true`；`tmpfs /tmp`；数据卷唯一可写；`no-new-privileges`；健康检查访问 `/api/v1/system/health`。

## 13. 可观测性

- 结构化日志（文本）：时间、级别、request_id、method、path、status、耗时、user_id。
- `/api/v1/system/health` 返回 `{status, time, version}`；Docker healthcheck 使用它。
- 审计日志面向业务可追溯；应用日志面向运维。
- v1 不引入 Prometheus/OpenTelemetry；文档预留接入点。

## 14. 扩展点

1. 新增业务单据：复制 `inbound` 模块骨架，调用 `inventory` 的新 movement 方法，不修改现有单据。
2. 新增库存维度（批次/库位）：在 `inventory_balances` 与 ledger 增加维度字段，更新唯一键；通过数据库迁移处理。
3. 迁移 PostgreSQL：替换 `DATABASE_URL`，调整 SQLite PRAGMA 分支；SQLAlchemy 模型基本不变。
4. 审批流：在单据模块内增加状态与 `approvals` 表，不改库存接口。
5. API 集成：新增 `integrations` 模块，复用 service，不直接写表。

## 15. 架构验收清单

- [ ] 任一单据模块删除后，其他模块仍可导入（不产生循环依赖）。
- [ ] 只有 inventory 模块包含 inventory 表的写操作。
- [ ] 所有路由的写接口都有 `require_roles`。
- [ ] 所有列表接口有分页上限。
- [ ] 单据确认路径有幂等保护与回滚测试。
- [ ] 前端页面无直接 fetch，无硬编码角色颜色，无未处理 API 错误。
- [ ] Docker 与 Windows 启动均能访问 `/api/v1/system/health`。
