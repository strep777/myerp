# Lager 仓储管理系统 — 测试报告

> 版本：1.1.0  
> 测试日期：2026-11-11  
> 测试范围：后端 API、业务闭环、权限与安全、AI 全链路、前端真实浏览器交互、Windows 一键启动、备份  
> 结论：**功能验收通过**；真实 DeepSeek/Ollama 模型与 Docker 运行仍受本机环境限制，已在第 8 节明确列为未验证项。

## 1. 测试结果总览

| 测试层 | 结果 | 说明 |
|---|---:|---|
| 后端冒烟 | 20/20 | health、登录、主数据、工作台、库存、报表、审计、用户、CSV、登出 |
| 后端端到端 API | **143/143** | 主数据、收/发/调/盘、成本、状态机、RBAC、安全边界、生命周期 |
| AI 全链路 API | **29/29** | 设置、加密、Ollama mock 分析、导入、库存、重复/过期令牌、SSRF、图片 content parts |
| 后端行覆盖率 | **90%** | 3,759 条语句，360 条未覆盖；全部业务 service ≥ 80% |
| 安全专项 | **15/15** | Cookie/JWT/限流/安全头/413/旧会话失效 |
| 前端桌面路由 | **21/21** | 新增 `/ai`、`/system/settings`；无 pageerror、无 console error、无意外 4xx/5xx |
| 前端移动端 | **21/21 路由** | 390×844；全部无横向溢出；AI 卡片布局；新手指引抽屉 |
| 全量 UI 交互 | **通过** | 商品/仓库/供应商/客户 CRUD、单据确认与库存不足、盘点完成、用户停用/重置、报表 4 tab/CSV、设置、AI、批量清除、剪贴板 |
| 业务 UI 闭环 | **10/10** | 商品→入库→出库→调拨→盘点→CSV |
| AI UI 闭环 | **8/8** | 文字分析→预览→改数量→确认入库→跳转详情；图片上传另验 |
| 剪贴板图片 | **2/2** | `Ctrl+V` 直接粘贴、点击“从剪贴板粘贴”按钮，预览 360×220 PNG |
| Ollama 动态模型 | **通过** | `/ai/ollama/models` 返回 mock 两项；下拉选择、缺失模型提示、连接测试三种结果 |
| stop.bat 安全 | **通过** | 正常停止 Lager；8000 被非 Lager Python 占用时拒绝并提示，不误杀 |
| 设置页 UI | 通过 | 读取/保存/刷新/恢复默认提示词；Key 不回显 |
| 列表全选 | 通过 | 商品/仓库/供应商/客户/库存/流水/三类单据/盘点/报表/用户/审计 |
| 批量清除 | 通过 | 商品/仓库/供应商/盘点草稿/入库草稿实际删除；有库存商品删除后余额/流水清零；被历史单据引用/已确认单据保留并提示；只读列表无删除入口；移动端通过 |
| 商品库存清空 | 通过 | 商品页清空 6 个库存→余额 0、商品保留、ADJUSTMENT 流水；库存余额页无调整入口 |
| 单据编号 | 通过 | 删除当天最高草稿后新建，编号继续递增（入库 0006→0007、盘点 0005→0006），不复用 |
| 新手指引 | 通过 | 桌面 7 步；移动端 7 步；完成后抽屉关闭 |
| 性能 | 达标 | 详见 [performance-report.md](performance-report.md) |
| Windows 一键启动 | 通过 | `start.bat` 启动后 health 200 |
| 备份 | 通过 | 生成 282,624 bytes 的 SQLite 备份，`integrity_check=ok` |
| Docker | **未实测** | 仅静态校验 compose YAML；本机无 Docker |

## 2. 环境与数据

- Windows 11（NT 10.0.26100），8 个逻辑 CPU。
- Python 3.9.1 开发环境；Dockerfile 使用 Python 3.11。
- Node.js v24.22.0、pnpm 11.8.0、Vite 6、React 18。
- 浏览器：Microsoft Edge（headless，Playwright Core 1.49.1）。
- 测试数据库：
  - `data/ui.db`：浏览器业务闭环与界面回归。
  - `data/e2e-v11.db`：v1.1 后端回归。
  - `data/ai-e2e.db`：AI 全链路自动化。
  - `data/ai-ui.db`：AI 页面与设置页。
  - `data/perf.db`：性能数据集（38.9 MB，10k 商品 / 100k 流水）。
  - `data/bulk-delete-test.db`：批量清除 UI 验证（测试后归档）。
  - `data/product-stock-test.db`：商品清空库存、含库存删除与历史引用验证（测试后归档）。
  - `data/qa-ui.db`：2026-11-11 全量 UI 交互回归（测试后归档）。
- AI 测试使用本地 mock provider（`127.0.0.1:11435`）模拟 Ollama/DeepSeek 协议，避免消耗真实 Key。
- 默认管理员：`admin / Admin@12345`，首次登录有改密提示。
- 交付时测试库与测试截图已归档到 `.ui-test/`（不参与运行）；`data/` 仅保留生产库 `lager.db` 与 `secret.key`。

## 3. 后端测试

### 3.1 冒烟测试

```powershell
cd F:\erp\backend
..\.venv\Scripts\python.exe ..\scripts\smoke_test.py
```

结果：`20/20`。覆盖健康检查、匿名 401、错误密码、登录、主数据、工作台、库存、报表、审计、用户、系统、CSV 下载、登出。

### 3.2 端到端业务测试

```powershell
cd F:\erp\backend
..\.venv\Scripts\python.exe ..\scripts\e2e_test.py http://127.0.0.1:8016
```

结果：`143/143`。主要断言：

- 商品、仓库、供应商、客户创建/查询/更新/停用/删除约束。
- 重复 SKU/编号、重复商品行、被引用主数据删除均返回 409。
- 入库草稿→确认→库存增加→移动平均成本；确认后不可编辑/重复确认。
- 出库确认前批量校验库存，不足时一次返回所有不足行。
- 调拨源仓减少、目标仓增加、成本继承、同仓调拨 400。
- 盘点创建快照、保存实盘、完成盘盈/盘亏、同仓进行中 409、`STOCKTAKE_STALE` 409。
- 盘点差异、库存余额、库存流水、收发存报表、CSV BOM 与文件名。
- 用户角色、最后管理员保护、不能停用自己、改密后旧会话失效。
- 工作台汇总/趋势/最近单据/低库存；系统信息与健康检查。
- 审计日志含 ADJUST、CONFIRM、COMPLETE、LOGIN、LOGOUT 等动作。

### 3.3 覆盖率

```powershell
cd F:\erp\backend
..\.venv\Scripts\coverage.exe run --source=app --concurrency=thread ..\scripts\measure_e2e_coverage.py
..\.venv\Scripts\coverage.exe report
```

- 总覆盖率：**90%**（3,759 statements / 360 missed）。
- 全部业务 service 模块 ≥ 80%：库存 92%、出库 84%、入库 84%、调拨 84%、盘点 88%、报表 92%、工作台 97%、用户 87%、认证 86%、主数据 80–85%。
- 未覆盖集中在不可达防御分支、异常兜底、静态文件 fallback、配置校验等。
- 完整逐文件结果：[coverage-summary.txt](coverage-summary.txt)。

> 覆盖率数据来自 v1.0 的 `measure_e2e_coverage.py`，v1.1 新增 AI 模块未纳入该统计；AI 由独立的 29 项全链路脚本覆盖。

### 3.4 AI 全链路测试

```powershell
cd F:\erp\backend
..\.venv\Scripts\python.exe ..\scripts\ai_e2e_test.py http://127.0.0.1:8017 --db F:/erp/data/final-v11-clean.db
```

结果：`29/29`。覆盖：

- 默认提示词长度 >1500 字符；`GET /ai/settings` 仅管理员。
- provider 小写归一化；Ollama `/api/tags` 连接测试。
- 空来源、私网链接、`file://` 被拒绝。
- 文本分析返回 token、items、warnings；token 只在数据库存 SHA-256。
- 导入生成 `IN-...` 单据，`auto_confirm=true` 时状态 CONFIRMED、数量/金额正确。
- 库存余额增加；商品匹配命中或自动创建。
- 重复 token 409 `AI_PREVIEW_USED`；未知 token 404。
- DeepSeek Key 保存后 GET 不回显；数据库存 Fernet `gAAAA...`；测试连接成功。
- 图片分析请求的 DeepSeek content parts 包含 `image_url` data URL。
- 最终在干净库 `data/final-v11-clean.db` 上复验 `29/29`；图片限制为 4 MB（base64 后仍低于 6 MB 请求上限）。

### 3.5 安全专项

```powershell
cd F:\erp\backend
..\.venv\Scripts\python.exe ..\scripts\security_check.py http://127.0.0.1:8016
```

结果：`15/15`。

- 匿名访问受保护接口 401。
- 登录 Cookie：HttpOnly、SameSite=Lax、Path=/；本地 HTTP 不误加 Secure。
- JWT 篡改 401。
- SQL 注入式搜索不返回 500，使用参数化查询。
- 连续 5 次失败后第 6 次 429；锁定窗口 15 分钟。
- 1 MB 以上请求 413，且 413 响应同样带 CSP、nosniff、X-Frame-Options 等安全头与请求 ID。
- 登出后旧会话立即 401（`token_version` 自增）。
- 系统信息、CSV、静态资源的缓存与安全头符合设计。

AI 专项安全（含在 29/29）：私网/file URL、Key 加密与不回显、token 一次性、图片字段校验、权限。6 MB 边界的独立 413 用例尚未单独构造。

## 4. 前端与真实浏览器测试

### 4.1 桌面路由巡检

Edge headless，1280×800。21 条路由全部渲染成功：

```text
/  /ai  /products  /warehouses  /suppliers  /customers  /inventory  /inventory/ledger
/inbound-orders  /inbound-orders/new  /outbound-orders  /outbound-orders/new
/transfer-orders  /transfer-orders/new  /stocktakes  /reports  /system/users
/system/audit-logs  /system/settings  /system/info  /does-not-exist
```

- 无 pageerror，无 console error。
- 网络错误仅为登录前 `/auth/me` 的预期 401。
- 所有列表、表单、错误态、空态、对话框和分页均正常打开。

### 4.2 移动端

390×844，遍历全部 21 条桌面路由（含新建单据页、AI、设置、404），并覆盖 AI 预览/新手指引：

- 全部 `scrollWidth=390`，0px 页面级横向溢出；每页均有 h1，无 pageerror。
- AI 预览在移动端切换为卡片：名称、SKU/规格/置信度、数量、单价、小计、删除均可见。
- 新手指引自动打开 280px 非模态导航抽屉，7 步“下一步”全部可点击，完成后抽屉关闭、回到工作台。
- 抽屉菜单可滚动，macOS 风格与桌面一致。

### 4.3 真实业务闭环

`F:\erp\.ui-test\flow.mjs`，结果 `10/10`：

1. 登录。
2. 新建商品 `UIT-488664`。
3. 新建入库 10 @ 7.5 并确认。
4. 库存显示 10。
5. 新建出库 3 并确认。
6. 库存显示 7。
7. 调拨 2 到广州分仓并确认。
8. 新建广州仓盘点、实盘调整、保存并完成。
9. 库存和流水随之正确变化。
10. 报表页导出 CSV（文件非空，带 BOM 与表头）。

### 4.4 AI 页面闭环

`F:\erp\.ui-test\v11-ai-flow.mjs`，在 8014 + mock 11435 上结果 `8/8`：

1. 登录并进入 `/ai`。
2. 文字来源输入两行商品。
3. 分析后渲染“识别预览”。
4. badge 显示 2 个商品。
5. 新建商品提示与 warning 可见。
6. 修改数量后合计更新。
7. 选择仓库、确认入库。
8. 成功页显示 `IN-...`、数量、金额，并可跳转入库单。

图片上传另用 1×1 PNG 验证：预览 2 行、无控制台错误。设置页读取/追加/保存/刷新/恢复默认提示词通过，Key 不回显。

剪贴板图片在 8000 生产实例上另测 2/2：用 Edge 授权 `clipboard-read/clipboard-write`，写入 360×220 PNG 后按 `Ctrl+V`，预览 `naturalWidth=360`，toast「已从剪贴板读取截图」；移除后点击“从剪贴板粘贴”再次成功，控制台无错误。截图 `.ui-test/clipboard-paste.png`。

### 4.5 列表全选与引导

- 8011 主库：用户 1/1、审计 18/18、报表流水 7/7 全选通过。
- 8012 性能库：入库/出库/调拨各 20/20；盘点创建后 1/1。
- 表头复选框、行复选框、indeterminate、计数、取消全选、复制均正常。
- 分页只全选当前页；工具条仅在已选时显示“本页已选 N / total 项”；“取消全选”只取消勾选，不删除数据。
- 批量清除（8018 测试库，确认对话框 → 顺序 DELETE）：
  - 商品：2/2 删除成功，列表清空，toast「已清除 2 项商品」。
  - 仓库：1/1 删除成功；供应商：1/1 删除成功；盘点草稿：1/1 删除成功。
  - 入库单：草稿 1/1 删除成功；已确认单保留，toast「已清除 1 项，1 项未删除：…只有草稿单可以删除」；再次全选已确认单，0 删除、1 保留。
  - 只读列表：库存余额勾选后无“清除数据”按钮，仅保留全选/复制；VIEWER 登录商品页可全选但无“清除数据”，权限门控有效。
  - 移动端 390×844：工具条换行正常、确认框完整可见、删除后列表清空、无横向溢出。
- 商品库存清空与含库存删除（8019 测试库）：
  - 入库 5 后调用 `POST /products/{id}/clear-stock`，返回 `cleared_warehouses=1, cleared_quantity=5.0`，商品保留、余额 0、生成 ADJUSTMENT 流水。
  - 通过库存调整建 7 个库存后删除商品：204，商品 404，DB 中该商品 balances/ledger 均为 0，确认级联清除。
  - 有入库单行引用的商品删除仍 409 `PRODUCT_IN_USE`，历史单据保持完整。
  - UI：商品行“清空库存”确认框→toast「已清空 6 个库存」→商品保留、库存 0；随后删除商品成功；库存余额页“库存调整”按钮数 0。
- 搜索/筛选变化清空选择，符合“选择只作用于当前结果页”的语义。
- 桌面新手指引 7 步完成并写入 `lager_tour_completed=1`；移动端同样完成。

### 4.6 全量 UI 交互回归（2026-11-11）

在独立 8020 QA 库上逐页操作，全部通过：

- 商品：空提交校验、创建、搜索、编辑、删除；清空库存 38→0；有库存无引用商品删除后余额/流水清零；被单据引用删除 409。
- 仓库/供应商/客户：创建、编辑、删除与确认框。
- 入库：建草稿→确认，库存 32→35；出库：库存不足 409，确认框可取消、草稿保留；调拨/盘点：盘点差异 +1 完成并写库存。
- 用户：新建、角色修改、停用、重置密码；状态与权限即时生效。
- 报表：4 个 tab（库存汇总/低库存/收发存/库存流水）、搜索、CSV 下载。
- 设置：提示词保存/刷新/恢复默认；Ollama 动态模型列表与连接三态。
- AI：文字分析与确认入库；剪贴板 `Ctrl+V` 读取截图。
- 批量清除：2 个商品全选删除成功；只读列表无删除入口。
- 单据编号：删除最高草稿后重建，编号继续递增，不复用（审计日志参与取号）。
- 安全：`scripts/security_check.py` 支持 `BASE` 端口，对 8020 运行 15/15。

## 5. Windows 启动、备份与 Docker

### 5.1 Windows 一键启动

- `start.bat` 已转为 UTF-8 无 BOM + CRLF，修复了 cmd 对 LF 文件的中文解析错乱；启动逻辑交给 `scripts/launcher.py`。
- 实测 `cmd /c start.bat`：
  - 创建/复用 `.venv`，检查依赖。
  - 检测 8000 端口：已有健康 Lager 时直接复用并退出，不再启动第二个 Uvicorn。
  - 端口被其他程序占用时输出占用 PID 并退出，不覆盖、不 kill 未知进程；实测用临时 HTTP 服务占用 8000，输出 `PID: 21716` 与错误提示。
  - 冷启动 Uvicorn 于 `127.0.0.1:8000`（单 worker），轮询健康后打印地址与初始账号。
  - **不再自动打开 Edge/浏览器**，避免“现有实例以提升权限运行”的提权提示；用户手动打开打印出的 URL。
  - 冷启动输出无 `admin is not recognized` 错误。健康检查返回 200，停止后端口关闭。
- 删除全部商品、保留仓库后再次启动：`seed_demo` 检测到已有仓库即跳过，修复 `UNIQUE constraint failed: warehouses.code`；生产 `data/lager.db` 重启 health 200，商品 0 条、仓库 2 条，空目录不影响使用。
- 生产 `8000` 当前处于运行状态；测试用临时服务均已停止。
- `stop.bat` 调用 `scripts/stopper.py`：`netstat` 查 8000 LISTENING PID，再校验 `/api/v1/system/health` 为 Lager 且进程名为 python；只有三者同时满足才 `Stop-Process`，否则拒绝并打印 PID。实测正常 Lager 停止成功，8000 被非 Lager Python 占用时拒杀（exit 1）；`Get-NetTCPConnection` 在该环境不可靠，脚本不依赖它。

### 5.2 备份

```powershell
F:\erp\scripts\backup.py
```

实测生成 `F:\erp\backups\lager-20261109-191637.db`（282,624 bytes，`PRAGMA integrity_check=ok`），使用 SQLite Online Backup API，兼容 WAL。

### 5.3 Docker

- Dockerfile 已改为单镜像：直接复制 `frontend/dist`，不在 Docker 内运行 Node/pnpm；`/app/backend/app` 布局保持 `PROJECT_ROOT=/app`。
- `docker-compose.yml` 通过 PyYAML 静态解析：服务名 `lager`，`read_only: true`，`cap_drop: ALL`，`pids_limit: 256`，数据卷 `lager_data`，tmpfs `/tmp`。
- 国内源：基础镜像 `docker.m.daocloud.io/library/python:3.11-slim-bookworm`（已用 Registry API 确认 manifest 200）；apt 使用 USTC（Release 200）；pip 使用 TUNA（Simple 200）。
- 已检查构建上下文包含 `frontend/dist/index.html`、`backend/app/main.py`、`backend/requirements.txt`；`start.sh` 在 dist 缺失时提前报错。
- 新增 `F:\erp\scripts\verify_docker.py`，静态校验 compose YAML、read_only/cap_drop/卷/healthcheck、Dockerfile 国内源与预构建 dist、构建上下文；实测输出 `DOCKER CONFIG OK`。
- 新增 `.gitattributes`：`Dockerfile`、`*.sh`、`docker-compose.yml` 强制 LF，`*.bat` 强制 CRLF，避免 Windows checkout 后 shell/Dockerfile 被转成 CRLF。
- 本机没有 Docker/podman/WSL 发行版，**未执行 `docker compose build/up`**，因此不能宣称 Docker 运行验证通过。
- 建议在目标 Ubuntu 主机执行：

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8000/api/v1/system/health
```

- 构建失败排查：先尝试 `PYTHON_IMAGE=python:3.11-slim-bookworm docker compose build`；pip 报错时确认 `PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple`；完全离线用 `docker save` / `docker load` + `docker compose up -d --no-build`。

## 6. 性能结论

详见 [performance-report.md](performance-report.md)：

- 核心读接口 p95 36–93 ms。
- 200 行入库确认 165.9 ms（原 568.3 ms）。
- 44,676 行流水 CSV 1.48 s（原 5.69 s）。
- 20 客户端混合读写 200 请求，0 错误，p95 351 ms。
- 前端最新构建产物 gzip 合计约 214.4 KB（index 107.32 + vendor 54.17 + ui 40.18 + CSS 12.76）。

## 7. 测试期间修复的缺陷

| 缺陷 | 修复 |
|---|---|
| FastAPI 204 路由带 response body，启动断言失败 | 所有 204 路由补 `response_model=None` |
| seed 给 Warehouse 传 `address` | 改为 `location` / `manager` |
| 客户路由未注册，POST /customers 405 | `main.py` 注册 `customer_router` |
| 草稿单更新删除/插入撞唯一键 | `_apply_lines` 先 `clear()` 再 `flush()` |
| 盘点单号访问 `order_no` 500 | numbering 回退 `stocktake_no` |
| 删除最高草稿后单据编号复用 | `next_document_no` 同时取审计日志中的历史最大号，保证只增不复用 |
| 同商品重复行 | 服务层统一 400 `DUPLICATE_PRODUCT` |
| 413 响应缺安全头 | `_security_headers` 应用到早退响应 |
| `Button asChild` 同时传 spinner 和 children，库存页崩溃 | asChild 只渲染 children |
| 盘点/报表仓库筛选 400 | options limit 100 → 50 |
| 800px 高侧栏遮住系统入口 | 压缩导航高度 + 细滚动条 |
| 工作台无数据仍画空坐标轴 | 改为“近期还没有出入库记录”空态 |
| start.bat 中文乱码/`oto` 报错 | 全部 .bat 改 UTF-8 无 BOM + CRLF |
| 200 行确认 400 次 SQL / CSV 5.69s | 批量预取 + 流式 CSV，降至 165.9ms / 1.48s |
| cryptography 43.0.3 Windows DLL 加载失败 | 固定 41.0.7 |
| httpx 在 NO_PROXY 含 IPv6 时 InvalidURL | Client 使用 `trust_env=False` |
| AI 预览 Radix Select 空字符串报错 | 供应商用 `"auto"` 哨兵；仓库用 placeholder |
| AI 移动端预览需横向滚动 | 桌面表格隐藏，移动端卡片 |
| 移动端 Intro.js 被 Dialog 遮挡 | 非模态导航面板 + onPrepare/onExit |
| AI 新建商品偶发 0 | mock 返回带序号商品名，避免复用旧数据 |
| AI 预览 warning 不可见 / 空态拥挤 | badge 用 lines.length；成功文案准确；右栏说明 |
| “清除”语义与“取消全选”重复，用户期望删除数据 | 改为“清除数据”：二次确认、逐条 DELETE、失败项保留并提示；取消全选只负责取消勾选；只读/审计/派生列表不提供删除 |
| 启动器重复启动导致 `WinError 10048`，端口占用时直接失败 | 新增 `scripts/launcher.py`：健康实例复用、端口占用报 PID、单实例 |
| 启动脚本账号提示被控制台误解析为 `admin` 命令 | 账号/密码提示移入 Python 启动器输出，批处理只打印固定文本 |
| 启动器自动 `webbrowser.open` 触发 Edge 提权/重启提示 | 取消自动打开浏览器，只打印 URL；避免干预用户浏览器 |
| 删除全部商品后重启，demo seed 仍插入 SH/GZ 导致 `UNIQUE constraint failed: warehouses.code`，应用启动失败 | `seed_demo` 检测到已有仓库或商品即跳过；demo seed 失败只回滚并记录日志，不再阻断启动；生产库重启 health 200 |

## 8. 未验证项与残余风险

- **Docker 镜像未实际构建**；目标 Ubuntu 环境首次构建仍需执行一次。
- **真实 DeepSeek / Ollama 未测**：测试使用本地 mock 验证协议和业务链路。真实 Key、模型标签、限流、图片理解质量需在目标环境验收。
- **真实电商链接未测**：自动化只验证 URL 校验与 mock HTML；反爬、登录、JS 渲染页面可能抓不到正文。
- 未在 Safari / Firefox 上测试；仅 Edge Chromium。
- 未执行 8 小时 soak test、Lighthouse/FCP 实测、50,000 行 CSV 的精确样本。
- AI 分析 6 MB 边界的独立 413 用例未单独构造。
- SQLite 单写者模型：高并发写入会串行化；适合单实例中小企业，不适合多实例水平扩展。
- 生产必须修改默认管理员密码，并设置独立的 `SECRET_KEY` 与强 `ADMIN_INITIAL_PASSWORD`。
- `data/` 与测试截图仅用于本机验收，不应提交真实生产数据。

## 9. 最终判定

**功能验收：通过（v1.1）。**  
后端业务 API、AI 全链路、权限与安全边界、前端桌面/移动端、列表全选、新手指引、真实收/发/调/盘闭环、Windows 一键启动和备份均已验证。未闭环项是 Docker 实机构建、真实模型/电商页面验收；部署文件与 AI 设置入口已就绪，需在目标环境完成一次真实验收。

## 10. 复现命令

```powershell
# 后端回归
cd F:\erp\backend
..\.venv\Scripts\python.exe ..\scripts\e2e_test.py http://127.0.0.1:8016

# AI 全链路
..\.venv\Scripts\python.exe ..\scripts\ai_e2e_test.py http://127.0.0.1:8017 --db F:/erp/data/final-v11-clean.db

# 安全专项
..\.venv\Scripts\python.exe ..\scripts\security_check.py http://127.0.0.1:8016

# 前端类型检查与构建
cd F:\erp\frontend
pnpm exec tsc --noEmit
pnpm run build
```
