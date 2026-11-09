# Lager 仓储 · 性能设计

版本：1.1  
日期：2026-11-09  
目标：中小企业单仓/多仓日常使用，低延迟、低资源、可预测  
关联：[架构](02-architecture.md)、[数据模型](03-data-model.md)、[测试](08-testing.md)

## 1. 性能目标（验收口径）

| 场景 | 指标 | 目标 |
|---|---|---|
| 登录 | p95 | ≤ 500 ms（含 PBKDF2 600k 迭代） |
| 常规列表（商品/单据/库存） | p95 | ≤ 200 ms（1 万商品、10 万流水） |
| 单据详情（≤200 行） | p95 | ≤ 150 ms |
| 确认入库/出库/调拨（≤200 行） | p95 | ≤ 500 ms |
| 工作台聚合 | p95 | ≤ 300 ms（10 万流水） |
| 库存流水筛选 | p95 | ≤ 300 ms（10 万流水） |
| 收发存报表（月，1 万 SKU） | p95 | ≤ 800 ms |
| CSV 导出 5 万行 | 完成 | ≤ 5 s |
| 首屏（内网，冷缓存） | FCP | ≤ 1.5 s |
| 前端初始 JS | gzip | ≤ 300 KB |
| 并发 | 20 用户混合读写 | 错误率 < 1%，p95 不翻倍 |
| 持续写入 | 5 写/秒 | 稳定，无锁超时 |
| AI 设置读取/保存 | p95 | ≤ 100 ms |
| AI 分析（不含上游） | 服务端开销 | ≤ 300 ms；上游模型另计 |
| AI 导入（≤50 行） | p95 | ≤ 500 ms（不含自动确认的库存写入） |
| AI 上传 | 体积 | 图片 ≤4 MB；请求 ≤6 MB |

> 以上为设计目标，最终以第 8 节基准测试实测为准；未达标必须记录原因与改进项。

## 2. 容量模型

| 数据 | 一年预估 | 三年预估 | 说明 |
|---|---|---|---|
| 商品 | 1,000–10,000 | 同左 | 主数据 |
| 仓库 | 1–20 | 同左 | |
| 单据 | 20,000 | 60,000 | 每单 1–50 行 |
| 库存流水 | 50,000–200,000 | 600,000 | 主要增长表 |
| 审计日志 | 30,000 | 100,000 | |
| 数据库大小 | 100–300 MB | < 1 GB | SQLite 舒适区 |

结论：单文件 SQLite 足够；瓶颈更可能在前端体验和复杂报表，而非存储。

## 3. 数据库性能

### 3.1 PRAGMA

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;      -- 确认库存不丢失，优先安全
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 10000;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -20000;     -- 约 20 MB 页缓存
```

- WAL 允许读写并行；写写串行。
- `synchronous=FULL` 每次提交 fsync；目标 5 写/秒，SSD 足够。
- `busy_timeout` 让并发写等待而非立即失败；仍可能超时，前端提示重试。
- 连接参数：`check_same_thread=False`、`timeout=10`；SQLAlchemy `pool_pre_ping=True`。
- 每个请求一个 Session；请求结束关闭。避免长事务。

### 3.2 索引清单

| 表 | 索引 | 支撑查询 |
|---|---|---|
| users | `uq_users_username` | 登录 |
| products | `uq_products_sku`、`ix_products_name`、`ix_products_category` | 搜索/筛选 |
| warehouses | `uq_warehouses_code` | 选择器 |
| suppliers/customers | `uq_*_code`、`ix_*_name` | 搜索 |
| inventory_balances | `uq_balances_product_warehouse`、`ix_balances_warehouse` | 库存列表/唯一写 |
| inventory_ledger | `ix_ledger_product_time`、`ix_ledger_warehouse_time`、`ix_ledger_ref` | 流水/来源追溯 |
| inbound_orders | `ix_inbound_status`、`ix_inbound_created_at`、`ix_inbound_warehouse` | 列表 |
| outbound_orders | 同入库 | 列表 |
| transfer_orders | `ix_transfer_status`、`ix_transfer_created_at` | 列表 |
| stocktakes | `ix_stocktake_status`、`ix_stocktake_created_at` | 列表 |
| audit_logs | `ix_audit_created_at`、`ix_audit_user`、`ix_audit_entity` | 审计筛选 |

原则：只为真实查询建索引；联合索引把等值列放前、时间列放后。写多的表（ledger）索引不超过 3 个。

### 3.3 查询模式

1. **列表分页**：`ORDER BY created_at DESC, id DESC LIMIT :size OFFSET :offset`；同时 `COUNT(*)` 用相同 WHERE。数据量大时 offset 变慢，v1 上限 10 万级可接受；后续可改游标分页。
2. **避免 N+1**：单据详情用 `selectinload(Order.lines)`；列表只查单据主表，不加载明细。
3. **聚合下推**：工作台/报表的 `SUM/COUNT/GROUP BY` 在 SQL 完成，不把明细拉到 Python。
4. **只查需要的列**：列表查询指定列，避免 `SELECT *` 大字段（备注等）。
5. **低库存**：`JOIN products p ON ... WHERE p.safety_stock > 0 AND b.quantity <= p.safety_stock`；依赖 `ix_balances_warehouse`，数据量小。
6. **收发存**：先取期初（每个商品期间前最后一条流水），再聚合期间流水；用窗口函数或两次查询在 Python 合并。SQLite 3.25+ 支持窗口函数。
7. **最近单据**：4 个单据表各取 `LIMIT n`，Python 合并排序取前 n；避免昂贵的全表 UNION。
8. **审计**：默认按时间倒序 + 分页；`detail` 不进入列表查询。

### 3.4 写入性能

- 单据确认：1 次状态条件更新 + N 次余额条件更新 + N 次 INSERT 流水 + 1 次审计；200 行约 400 条语句，单事务，目标 <500ms。
- 批量插入流水使用 `add_all`，SQLAlchemy 会按方言合并；不逐条 commit。
- 不在循环中查询商品/仓库：先批量 `IN` 查询并用 dict 映射，减少往返。
- 确认接口是写热点；前端按钮 loading 防重复，后端条件状态更新防重。
- 锁冲突：捕获 `OperationalError: database is locked`，返回 503 `DB_BUSY`，前端提示「系统繁忙，请重试」；v1 不自动重试整个事务。

### 3.5 数据库维护

- 每周 `PRAGMA optimize;`；每月 `PRAGMA wal_checkpoint(TRUNCATE);`（低峰）。
- 备份使用 `.backup`，不直接复制 WAL 状态下的主文件。
- 数据量超过 1 GB 或持续写入 >20/秒时，评估迁移 PostgreSQL。

## 4. 后端性能

- Uvicorn 单 worker（SQLite 写串行，多 worker 收益有限且内存限流失效）；`--workers 1`。
- 同步 SQLAlchemy + FastAPI 同步路由：FastAPI 放入线程池，避免阻塞事件循环。
- 响应模型精简：列表不返回明细、不返回大文本；Pydantic `from_attributes`。
- GZip：`minimum_size=1024`，压缩 JSON/CSV；静态资源优先由反向代理 Brotli/GZip。
- 静态文件：生产由 FastAPI `StaticFiles` 托管，带哈希资源设置 `Cache-Control: public, max-age=31536000, immutable`；`index.html` `no-cache`。
- 连接池：默认 5 + 10 overflow；SQLite 文件连接轻量；避免池过大造成锁竞争。
- 密码哈希是 CPU 密集；登录限流也防止 PBKDF2 被滥用为 DoS。600k 迭代在目标机器约 100–250ms，符合目标。
- 日志异步？v1 同步写 stdout，Docker 收集；量小，不引入队列。

### 4.1 AI 路径

- 分析是 I/O 密集：链接抓取放 `run_in_threadpool`，不阻塞事件循环；上游超时 120s。
- 图片不落盘，内存 base64；请求体上限 6 MB，避免大图拖垮 worker。
- 上游响应只取 JSON，限制输出 token；预览最多 50 行。
- 导入复用批量预取/一次 flush 的入库服务；50 行也在毫秒级。
- 单 worker 下 AI 请求会占用线程；并发分析建议 ≤3，超时/限流由上游和 Nginx 控制。
- 不在请求内做图片压缩/OCR；前端先压缩到长边 1600 px。

## 5. 前端性能

- 路由级 `React.lazy` + `Suspense`；登录页独立 chunk，未登录不加载业务页面。
- 依赖控制：React、react-router、Radix 必要组件、lucide（按图标导入）、sonner、clsx、tailwind-merge、cva、Intro.js（仅引导页/按需加载）；不引入图表库、状态管理库、axios、dayjs（用 `Intl`）。
- Vite `manualChunks`：`react-vendor`、`radix-vendor`；单 chunk 不超过 200 KB gzip。
- 图标按名导入，禁止 `import * as Icons`。
- 列表只渲染当前页（≤100 行）；不做虚拟滚动（分页已足够）。
- 搜索输入 300ms 防抖；切换筛选立即请求并取消旧请求（AbortController）。
- 图片/插画使用内联 SVG，无大图；字体使用系统字体，零字体下载。
- 骨架屏减少布局抖动；表格固定列宽，数字使用 tabular-nums。
- 生产构建：`tsc -b && vite build`；开启 minify、cssCodeSplit；不生成 sourcemap（或仅内部）。
- 缓存：`/assets/*` 长缓存；API 不缓存（`Cache-Control: no-store`）。

## 6. 慢查询与监控

- 开发环境 `SQLALCHEMY_ECHO=false`；需要时开启，生产禁止。
- 中间件记录每个请求耗时；>500ms 打 WARN 日志（含 request_id、path）。
- 健康检查不查库；额外提供启动日志打印数据库路径、版本、种子状态。
- v1 不接 Prometheus；日志可被 `docker logs`/Loki 采集。
- 前端在控制台记录 API 耗时（仅开发）。

## 7. 性能反模式（禁止）

- 在循环中执行 SQL（N+1）。
- 列表接口返回全部明细/全部数据。
- 前端每次渲染创建新 fetch 且无取消。
- 在事务中做 PBKDF2、CSV 生成、网络请求。
- 使用 `SELECT *` 后 Pydantic 全量序列化大字段。
- 为“可能用到”建大量索引，拖慢写入。
- 在 SQLite 上开多 worker 追求并发。

## 8. 基准测试计划（功能完成后执行）

### 8.1 数据准备

脚本 `backend/scripts/bench_seed.py`（测试阶段编写）：
- 1,000 商品、5 仓库、200 供应商/客户；
- 100,000 流水（分布在 12 个月）；
- 10,000 单据（8 草稿/2 确认）；
- 30,000 审计日志。

### 8.2 工具

- API：`locust` 或自写 `httpx` 并发脚本（不引入生产依赖，放在 `requirements-dev.txt`）。
- 数据库：`sqlite3` `.timer on` 执行关键查询。
- 前端：Chrome Lighthouse（内网模式）、Vite build 报告。

### 8.3 场景

1. 登录 → 工作台 → 商品列表 → 库存列表（20 并发，5 分钟）。
2. 创建 50 行入库单 → 确认（10 并发，重复 100 次）。
3. 创建 20 行出库单 → 确认（库存充足/不足各半）。
4. 流水筛选（商品+日期）翻 5 页。
5. 收发存月报 + CSV 导出。
6. 盘点 500 行录入 + 完成。

### 8.4 通过标准

- 第 1 节目标全部满足；
- 无 5xx；无 `database is locked` 未处理；
- 确认 100 次后库存数量与流水严格一致；
- 内存 RSS 稳定（无持续增长）；
- 前端 Lighthouse Performance ≥ 85（内网）。

### 8.5 记录

结果写入 `doc/performance-report.md`（测试阶段生成），包含：环境、数据量、命令、p50/p95/p99、错误率、瓶颈与改进。未实测不得声称达标。

## 9. 扩展路径

| 触发条件 | 措施 |
|---|---|
| 流水 > 500 万 | 归档冷数据 / 分区表 / PostgreSQL |
| 写并发 > 20/秒 | PostgreSQL + 连接池 + 多 worker |
| 商品 > 5 万 | SKU 搜索改 FTS5 或前缀索引 |
| 报表 > 2s | 预聚合日汇总表（定时任务） |
| 多实例 | 迁移 PostgreSQL + Redis 会话/限流 |
| 前端包 > 300KB | 进一步拆包、按需加载 Radix、审查依赖 |
