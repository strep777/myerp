# Lager 仓储 · 实施路线图

版本：1.1  
日期：2026-11-09  
原则：文档先行 → 后端 → 前端 → 部署 → **全部功能完成后统一测试**  
关联：[PRD](01-product-requirements.md)、[架构](02-architecture.md)、[测试](08-testing.md)

## 1. 里程碑

| 里程碑 | 内容 | 交付物 | 完成标准 |
|---|---|---|---|
| M0 文档 | 调研 + 10 份设计文档 | `doc/*.md` | 需求、架构、数据、API、UI、安全、性能、测试、部署、路线图评审通过 |
| M1 后端基座 | 配置、数据库、安全、错误、权限、种子 | 可启动的 FastAPI；health | 建表成功；admin 可登录；`/api/docs` 可访问 |
| M2 认证与用户 | 登录/登出/me/改密、用户 CRUD、审计 | API + pytest 前置代码（不运行） | 角色校验生效；最后管理员保护 |
| M3 主数据 | 商品、仓库、供应商、客户 | CRUD API | 唯一键、停用规则、分页搜索 |
| M4 库存核心 | 余额、流水、调整、成本、单号 | inventory service | 入库/出库/调拨/盘点可复用；事务测试通过 |
| M5 入库 | 草稿、编辑、确认、删除、列表 | API | 确认后余额/流水/审计一致；重复确认 409 |
| M6 出库 | 同上 + 库存不足整单回滚 | API | 并发不超卖；错误明细 |
| M7 调拨 | 双仓事务、成本传递 | API | 两仓一致；同仓拒绝 |
| M8 盘点 | 快照、录入、完成、差异入账 | API | 未录完不可完成；完成后只读 |
| M9 报表/工作台 | 汇总、低库存、流水、收发存、CSV、KPI | API | 口径正确；导出安全 |
| M10 前端基座 | Vite/Tailwind/shadcn 风格、布局、路由、API Client、Auth | 可登录空壳 | macOS 风格；401 处理；响应式 |
| M11 前端业务 | 全部页面与交互 | 可用 SPA | 所有 API 接通；三态齐全；无原生弹窗 |
| M12 部署 | Dockerfile、compose、bat、start.sh、备份脚本 | 一键启动包 | Ubuntu/Windows 验证 |
| M13 测试 | pytest、E2E、安全、性能、部署 | 测试/性能报告 | P0/P1 = 0；目标达标 |
| M14 交付 | README、用户手册、验收 | 完整仓库 | 用户验收 |
| M15 v1.1 增强 | 列表全选、Intro.js 指引、AI 设置/分析/入库 | 1.1.0 代码、文档、测试 | 143/143 + 29/29 + 15/15；UI 验收 |

## 2. 开发顺序与依赖

```text
M0
 └─ M1
     ├─ M2 ── M3 ── M4 ── M5 ── M6 ── M7 ── M8 ── M9
     │                                      │
     └──────────────────────────────────────┴─ M10 ── M11 ── M12 ── M13 ── M14
```

- M4 是核心，必须先稳定；单据模块只调用其 service。
- M10 可与 M9 并行（若多人），但本任务单人顺序执行。
- M13 严格在 M12 之后，禁止边写边测（用户明确要求）。

## 3. 工作分解（WBS）

### M1 后端基座

- `core/config.py`：pydantic-settings，路径/密钥/时区。
- `core/database.py`：engine、Session、UTCDateTime、PRAGMA、init_db。
- `core/security.py`：PBKDF2、JWT、Cookie 常量。
- `core/errors.py`：AppError、错误码、异常处理器。
- `core/permissions.py`：Role、权限矩阵。
- `core/deps.py`：get_db、current_user、require_roles。
- `core/middleware.py`：request_id、安全头、请求体限制、耗时日志。
- `main.py`：路由装配、静态托管、SPA fallback、启动钩子。
- `seed.py`：管理员 + 示例数据（幂等）。
- `modules/registry.py`：模型导入。

### M2 认证与用户

- User 模型、密码哈希、JWT `ver`。
- 登录限流（内存）、审计登录失败。
- 用户 CRUD、重置密码、最后管理员保护。
- 前端登录页在 M10 实现。

### M3 主数据

- Product/Warehouse/Supplier/Customer 模型与 schema。
- 唯一键冲突转 409；停用校验；options 接口。
- 分页/搜索/筛选通用 helper。

### M4 库存核心

- Balance/Ledger 模型；唯一键。
- `apply_inbound`、`apply_outbound`、`apply_transfer`、`apply_stocktake`、`adjust`。
- 条件更新防负库存；成本计算；流水写入。
- 单号生成器（前缀+日期+序号）。
- 余额/流水/概览查询。

### M5–M8 单据

每个模块固定结构：
- models：主表 + 明细，唯一约束。
- schemas：Create/Update/Out/List，字段白名单。
- service：create/update/delete/get/list/confirm/cancel；状态机；合计重算；审计。
- router：角色、分页、HTTP 状态码。
- 单据详情 `selectinload` 避免 N+1。

### M9 报表/工作台

- 复用 inventory queries；只读。
- 收发存 SQL/窗口函数；CSV 转义与上限。
- 工作台 4 个接口；最近单据合并。

### M10–M11 前端

- 设计令牌、Tailwind、基础 UI 组件（button/input/dialog/table…）。
- AppShell/侧栏/顶栏/路由守卫。
- API Client、AuthContext、错误映射、toast。
- 页面按模块实现：dashboard → products/warehouses/partners → inventory → inbound → outbound → transfers → stocktakes → reports → users/audit。
- 通用组件：PageHeader、DataTable、Pagination、StatusBadge、ConfirmDialog、ProductPicker、LineEditor、EmptyState。
- 响应式与键盘。

### M12 部署

- Dockerfile 多阶段、compose、.dockerignore、.env.example。
- start.bat/stop.bat/start.sh/backup 脚本。
- 配置 `FRONTEND_DIST`、`DATABASE_URL` 绝对路径。
- 容器非 root/read_only/tmpfs/healthcheck。
- README 快速开始。

### M13 测试

- 按 [08-testing.md](08-testing.md) 执行；测试代码此时才编写。
- 修复缺陷；必要时补自动化。
- 输出 `test-report.md`、`performance-report.md`。

## 4. 关键路径与风险

| 风险 | 影响 | 概率 | 应对 |
|---|---|---|---|
| 库存事务/成本计算错误 | 数据不可信（P0） | 中 | 先写核心 service；条件更新；测试阶段并发/回滚用例 |
| 前后端契约漂移 | 页面报错 | 中 | API 文档先行；统一 types；Swagger 对照 |
| Python 3.9 本机与 3.11 镜像差异 | 本地跑、容器挂 | 中 | 用 `Optional`/future annotations；Docker 最终验证 |
| 无 Docker 本机 | 无法本地验证 compose | 高 | 严格按 Dockerfile 设计；在目标 Ubuntu 验证；Windows 本机验证直启 |
| 前端依赖安装失败 | 无法构建 | 中 | 锁定版本；pnpm；保留 dist；bat 明确提示 |
| SQLite 锁冲突 | 确认偶发 503 | 中 | 单 worker；短事务；busy_timeout；前端重试提示 |
| 范围膨胀 | 延期/质量下降 | 高 | 严守 PRD 非目标；功能冻结后才测试 |
| 默认密码/HTTP | 安全风险 | 中 | 文档警示；生产检查清单；HTTPS 指南 |

## 5. 质量门禁

- 每个后端模块完成后：`python -m compileall` / 导入检查（不算测试）。
- 前端每页完成后：`tsc --noEmit`（类型检查属于构建，不属于功能测试）。
- 全部功能完成后：T0–T6 测试门禁。
- 未通过门禁不得标记完成。

## 6. 版本规划

### v1.0（本次）

- 单仓/多仓、商品主数据、入库/出库/调拨/盘点、库存余额/流水、报表、工作台、用户/审计、Docker/Windows。

### v1.1（已交付，2026-11-09）

- ✅ 所有列表当前页全选/复制；可删除档案/草稿单据支持批量清除（二次确认、失败保留），只读数据不提供删除。
- ✅ Intro.js 桌面/移动端新手指引。
- ✅ DeepSeek/Ollama AI 设置、可编辑默认提示词、截图/链接/文字分析、预览确认入库。
- ✅ AI Key 加密、预览令牌、SSRF 防护、6 MB 分析请求。
- ✅ 移动端 AI 卡片布局、非模态引导抽屉。
- 后续候选：Alembic 迁移；打印单据；批量导入商品；商品批量清空库存；邮件/Webhook 低库存提醒；暗色主题。

### v1.2

- 批次/效期、库位、序列号、多单位；采购/销售订单；审批流；附件。

### v2.0

- PostgreSQL 支持 + 多实例；开放 API/Token；BI 导出；SSO；审计归档。

## 7. 与 ERPNext 的映射

| ERPNext | Lager v1 | 说明 |
|---|---|---|
| Item | Product | 去掉 UOM 换算、批次、序列号 |
| Warehouse | Warehouse | 保留多仓 |
| Stock Entry | Inbound/Outbound/Transfer | 拆成三个易懂单据 |
| Stock Reconciliation | Stocktake | 盘点差异入账 |
| Stock Ledger Entry | Inventory Ledger | 不可变流水 |
| Bin | Inventory Balance | 商品×仓库余额 |
| Purchase Order/Receipt | 不做 | 只做入库，不覆盖采购 |
| Sales Order/Delivery | 不做 | 只做出库 |
| User/Role Permission | User/Role | 四角色简化 |

## 8. 完成定义（项目级）

- [x] M0–M15 开发与文档完成（v1.1）。
- [x] PRD P0 需求 100% 实现。
- [x] 前后端全部页面与接口接通。
- [ ] Docker Compose 在 Ubuntu 一键启动；Windows bat 一键启动（Windows 已实测；本机无 Docker，镜像未实际构建）。
- [x] 测试报告：P0/P1 = 0；安全清单通过；性能达标（见 [test-report.md](test-report.md)）。
- [x] v1.1 AI/引导/全选：E2E 143/143、AI 29/29、安全 15/15、桌面与移动端 UI 验收。
- [x] README + 用户手册 + 运维文档齐全。
- [x] 代码无 TODO/FIXME 遗留（除明确记录的 v1.1 项）。
- [ ] 用户验收确认。
