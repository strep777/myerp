# Lager 仓储管理系统 — 性能测试报告

> 测试日期：2026-11-09  
> 测试对象：`F:\erp` 后端 API（单 worker、SQLite）  
> 原始数据：[`performance-raw.json`](performance-raw.json)  
> 测试脚本：[`scripts/bench_seed.py`](../scripts/bench_seed.py)、[`scripts/bench_api.py`](../scripts/bench_api.py)  
> 版本说明：本报告的后端性能数据在 v1.0 基线上测得。v1.1 新增的 AI 设置/分析/导入以本地校验与入库编排为主，尚未做独立基准；最新前端构建（含剪贴板图片、Ollama 动态模型、全量 QA 修复与品牌精简）为 `index 372.82 KB / gzip 107.32 KB`、`vendor 165.20 / 54.17`、`ui 135.53 / 40.18`、CSS 65.71 / 12.76 KB，合计 gzip 约 214.4 KB，仍低于 300 KB 目标。v1.1 的功能与安全结果见 [test-report.md](test-report.md)。

## 1. 结论摘要

在 1 万商品 / 10 万级流水 / 3 万审计日志的数据集上，所有**直接实测**的核心读接口、200 行入库确认、4.4 万行 CSV 导出均达到设计目标。20 客户端混合读写无错误，p95 为 351.2 ms；绝对延迟可接受，但由于 SQLite 单写者模型，相对单请求延迟有明显放大，不能宣称“p95 不翻倍”。

| 类别 | 结果 |
|---|---|
| 核心读接口 p95 | 36–93 ms，全部 ≤ 300 ms 目标 |
| 登录 p95 | 343.6 ms，≤ 500 ms |
| 200 行入库确认 | 165.9 ms，≤ 500 ms |
| 4.4 万行流水 CSV | 1.48 s，≤ 5 s |
| 20 客户端混合读写 | 200 请求，0 错误，p95 351 ms |
| 前端初始 JS（gzip） | v1.0 73.46 KB；v1.1 三个入口 chunk 合计约 201.7 KB，含 CSS 约 214.4 KB，≤ 300 KB |

## 2. 环境与数据集

- 操作系统：Windows 11（NT 10.0.26100），8 个逻辑 CPU。
- Python：3.9.1（本机开发环境；Docker 镜像使用 Python 3.11）。
- Web：Uvicorn 0.32.1，单 worker，`127.0.0.1:8012`。
- 数据库：SQLite，WAL，`synchronous=FULL`，`busy_timeout=10000`。
- 未使用 Docker 或外部缓存；结果为同机 loopback 测试，不包含公网 RTT。
- 数据集：`F:\erp\data\perf.db`（测试后归档到 `.ui-test/db-archive/perf.db`），38.9 MB；10,000 商品、5 仓库、100,700 流水、10,002 张业务单据、30,196 条审计。
- 测试数据由 `bench_seed.py` 生成；每次基准会追加 200 行入库单和 100 条混合写操作。

## 3. 方法

`bench_api.py` 先登录获取 HttpOnly 会话，再对同一服务顺序执行场景；每场景默认预热 5 次、记录 40 次（CSV 与 200 行确认为单次大操作实测，因此表中标为单次）。并发场景使用独立 HTTP opener，并携带同一登录 Cookie。

运行命令：

```powershell
cd F:\erp\backend
..\.venv\Scripts\python.exe ..\scripts\bench_api.py
```

测试口径以 [07-performance.md](07-performance.md) 第 8 节和 [08-testing.md](08-testing.md) 第 10 节为准。

## 4. 实测结果

| 场景 | p50 | p95 | p99 | 目标 | 判定 |
|---|---:|---:|---:|---:|---|
| 登录（PBKDF2 600k） | 285.8 ms | 343.6 ms | 355.3 ms | p95 ≤ 500 ms | 通过 |
| 商品列表（第 1 页 20 条） | 31.8 ms | 39.2 ms | 45.2 ms | p95 ≤ 200 ms | 通过 |
| 商品搜索 `PERF-009` | 33.5 ms | 49.7 ms | 50.7 ms | p95 ≤ 200 ms | 通过 |
| 库存余额列表 | 60.4 ms | 75.1 ms | 84.4 ms | p95 ≤ 200 ms | 通过 |
| 库存流水筛选 | 32.2 ms | 47.9 ms | 49.9 ms | p95 ≤ 300 ms | 通过 |
| 入库单列表 | 31.6 ms | 41.7 ms | 46.2 ms | p95 ≤ 200 ms | 通过 |
| 工作台汇总 | 47.3 ms | 51.8 ms | 62.4 ms | p95 ≤ 300 ms | 通过 |
| 工作台 30 天趋势 | 32.3 ms | 36.1 ms | 47.9 ms | p95 ≤ 300 ms | 通过 |
| 库存汇总报表 | 67.3 ms | 85.2 ms | 103.3 ms | p95 ≤ 800 ms | 通过 |
| 审计日志列表 | 49.4 ms | 65.5 ms | 66.5 ms | p95 ≤ 200 ms | 通过 |
| 入库单详情（200 行） | 33.3 ms | 51.5 ms | 55.4 ms | p95 ≤ 150 ms | 通过 |
| 创建 200 行入库单 | 127.2 ms | 127.2 ms | 127.2 ms | 写入 ≤ 1 s | 通过 |
| 确认 200 行入库单 | 165.9 ms | 165.9 ms | 165.9 ms | p95 ≤ 500 ms | 通过 |
| CSV 库存（10,000 行） | 977.4 ms | 977.4 ms | 977.4 ms | ≤ 5 s | 通过 |
| CSV 流水（44,676 行） | 1,478.8 ms | 1,478.8 ms | 1,478.8 ms | ≤ 5 s | 通过 |
| 10 线程 × 20 次商品列表 | 126.1 ms | 172.2 ms | 182.4 ms | 错误率 < 1% | 通过 |
| 20 客户端混合读写 × 10 次 | 265.9 ms | 351.2 ms | 509.3 ms | 错误率 < 1% | 通过（延迟绝对值） |

补充说明：

- CSV 的 50,000 行硬上限没有单独生成 50,000 行样本；实测 44,676 行为 1.48 s，按线性估计仍低于 5 s，但报告不把估计值当作实测。
- 20 客户端混合读写共 200 请求，其中 100 次为库存调整写操作；错误率 0%。p95 351 ms 相对单请求 39 ms 有放大，原因是单进程写锁和 SQLite 单写者，不能宣称“p95 不翻倍”。
- 首屏 FCP 与 Lighthouse 未实测；前端构建产物 gzip 体积见下节。
- 登录耗时主要是 PBKDF2 600,000 次迭代，属于安全成本；首次登录约 0.3–0.4 s 可接受。

## 5. 优化记录

### 5.1 流水筛选

- `inventory_ledger` 增加 `(movement_type, created_at)` 与 `(created_at)` 索引。
- 列表计数只统计 `inventory_ledger`，不再为 `COUNT` JOIN 商品/仓库。
- 优化前流水筛选 p95 约 326 ms；优化后 47.9 ms。
- `EXPLAIN QUERY PLAN` 显示计数与分页均使用 `ix_ledger_type_time`，分页只回表 20 行。

### 5.2 200 行入库确认

- 确认前一次批量预取 200 个商品和当前仓库的余额。
- `apply_movement()` 增加可选 `balance` / `product` 参数，复用内存对象。
- 200 行只执行一次批量 flush 和一次 commit，不再逐行查询商品/余额。
- 优化前 568.3 ms；优化后 165.9 ms。

### 5.3 CSV 流水导出

- 改为直接查询所需列，不再先构造 4.4 万个 Pydantic 字典。
- `yield_per(2000)` 流式写入 `StringIO`，一次性编码返回。
- 优化前 5,691.5 ms；优化后 1,478.8 ms。

## 6. 前端体积

`vite build` 产物：

| 文件 | 原始体积 | gzip |
|---|---:|---:|
| `index-BjXGo7zQ.css` | 65.71 KB | 12.76 KB |
| `ui-DKjN2sGm.js` | 135.53 KB | 40.18 KB |
| `vendor-C7hBj5eU.js` | 165.20 KB | 54.17 KB |
| `index-CoJEafay.js` | 372.82 KB | 107.32 KB |

三个 JS chunk 合计 gzip 约 201.7 KB；含 CSS 约 214.4 KB，满足 ≤ 300 KB 目标。

## 7. 容量与限制

- SQLite 单写者：所有库存确认串行化，适合中小企业单实例；不适合高写并发或多实例水平扩展。
- 单 worker：内存限流、启动时间和缓存均为进程内状态；不要直接增加 `--workers`。
- CSV 上限 50,000 行，超过会返回 `EXPORT_TOO_LARGE`；这是保护内存和响应时间的硬限制。
- 备份使用 SQLite Online Backup API；WAL 模式下不直接复制 `.db` 文件。
- 未执行长时间 soak test（例如 8 小时持续写入）；生产前建议按实际峰值做一轮。
- 未在本机构建 Docker 镜像（本机无 Docker）；Docker 部署验证边界见 [test-report.md](test-report.md)。

## 8. 复现与数据保留

- 种子脚本：`scripts/bench_seed.py`（会重建 `data/perf.db`）。
- 基准脚本：`scripts/bench_api.py`。
- 原始结果：`doc/performance-raw.json`。
- 性能服务启动：

```powershell
cd F:\erp\backend
$env:DATABASE_URL='sqlite:///F:/erp/data/perf.db'
$env:SEED_DEMO_DATA='false'
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8012
```

> 本报告只记录真实执行结果。未执行的 Docker、Lighthouse、50k 精确样本和长时压测均明确标注为未验证，不用估算值替代实测。
