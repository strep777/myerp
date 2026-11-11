# Lager

> 轻量、可自托管的仓储管理系统 · v1.1.0

Lager 面向中小团队，把商品、仓库、往来单位、入库、出库、调拨、盘点和库存报表放在一个界面里。它不追求复杂参数，打开就能建档、做单、看库存；同时保留审计日志、角色权限和备份能力。

前端是 macOS 风格的响应式网页，后端是 FastAPI + SQLite。既可以双击 Windows 脚本在本机运行，也可以用 Docker Compose 部署到 Ubuntu。

---

## 界面与体验

- 桌面端侧栏导航 + 移动端抽屉，390px 宽度下无横向溢出。
- 所有业务列表支持**当前页全选 / 取消全选 / 复制选中**；可删除的档案和草稿支持二次确认后**批量清除数据**，失败项保留并提示原因。
- 新手指引（Intro.js）覆盖工作台、库存、业务、AI 助手和系统设置，桌面端和移动端都可完成。
- 表单只保留必要字段，错误就地提示；危险操作统一使用确认框。

## 功能

| 模块 | 能力 |
|---|---|
| 工作台 | 库存总量/总值、低库存、待处理草稿、7 天趋势、最近单据、快捷入口 |
| 基础资料 | 商品（SKU/条码/规格/安全库存/参考价）、仓库、供应商、客户 |
| 库存 | 实时余额、移动加权平均成本、不可变流水、低库存筛选；商品页统一清空库存 |
| 入库 | 草稿、编辑、确认入库、删除草稿；确认后增加库存与成本 |
| 出库 | 草稿、库存预检、确认出库、库存不足整单回滚 |
| 调拨 | 同仓/跨仓调拨草稿、确认、双方库存与流水 |
| 盘点 | 仓库快照、实盘录入、差异计算、完成盘点后自动写盈亏流水 |
| 报表 | 库存汇总、低库存、收发存、库存流水；CSV 导出 |
| 用户与审计 | 四角色（管理员/经理/操作员/只读）、启停、重置密码、操作审计 |
| AI 智能入库 | DeepSeek 或 Ollama；截图、链接、文字三种来源；预览确认后写入库存 |
| 系统 | 系统设置、健康检查、系统信息、备份与恢复 |

### AI 智能入库

- 默认支持 DeepSeek（OpenAI 兼容接口）和本地 Ollama。
- Ollama 模型不写死：设置页从 `/api/tags` 读取下拉列表，标签不存在时明确提示。
- 截图支持点击、拖拽和 **Ctrl+V 剪贴板粘贴**；图片只在内存中处理，不落盘。
- AI 只生成可编辑预览，确认后才由服务端重新校验并复用入库服务写库。
- API Key 使用 Fernet 加密存储，读取时只返回掩码；默认提示词可按团队规范修改。

## 技术栈

- 前端：React 18、Vite 6、TypeScript、Tailwind CSS 3、Radix UI、lucide-react、sonner、Intro.js
- 后端：FastAPI、SQLAlchemy 2、Pydantic 2、SQLite（WAL）、httpx、cryptography/Fernet
- 测试：Python 脚本化 E2E、安全专项、AI mock 全链路、Playwright + Edge UI 回归
- 部署：单镜像 Dockerfile、Docker Compose、Windows `start.bat`、Ubuntu `start.sh`

## 快速开始

### 环境要求

- **Docker 方式**：Docker Engine 24+、Compose v2、约 1 GB 磁盘；首次构建需要能拉取 Python 基础镜像和 pip 包。
- **Windows 本机**：Windows 10/11、Python 3.9+（推荐 3.11）、Node 20+ 与 pnpm（仅在前端 `dist` 缺失时需要）。
- 浏览器：Chrome / Edge / Firefox / Safari 最新版。

### Ubuntu / Linux（Docker Compose）

```bash
cd /opt/lager
cp .env.example .env        # 生产环境请填写 SECRET_KEY 与管理员初始密码
bash start.sh
```

或手动：

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8000/api/v1/system/health
```

浏览器打开 `http://<服务器IP>:8000`。

构建说明：

- 镜像直接复制仓库内已构建的 `frontend/dist`，不会在 Docker 内安装 Node/pnpm。
- 默认基础镜像走 DaoCloud 中国加速；apt 使用中科大 USTC，pip 使用清华 TUNA。
- 基础镜像无法拉取时，可改用官方或内网镜像：

```bash
PYTHON_IMAGE=python:3.11-slim-bookworm docker compose build
# 或
PYTHON_IMAGE=registry.example.com/library/python:3.11-slim-bookworm docker compose build
```

完全离线部署见 [部署文档](doc/09-deployment.md) 4.1（`docker save` / `docker load` + `docker compose up -d --no-build`）。构建前可运行：

```bash
python scripts/verify_docker.py
```

它会检查 compose、Dockerfile 国内源、`frontend/dist` 和构建上下文。

### Windows（本机 Python）

1. 安装 Python 3.9+，安装时勾选 **Add Python to PATH**。
2. 双击 `start.bat`。脚本会创建 `.venv`、检查依赖，并在缺少 `frontend/dist` 时尝试用 pnpm 构建前端。
3. 启动成功后终端会显示 `http://127.0.0.1:8000`；脚本不会自动打开浏览器，请手动打开。若已有 Lager 在运行，会复用实例，不会重复启动。

停止：在启动窗口按 `Ctrl+C`，或双击 `stop.bat`。

### 默认管理员

| 用户名 | 密码 |
|---|---|
| `admin` | `Admin@12345` |

密码由 `ADMIN_INITIAL_PASSWORD` 控制，**仅首次建库时生效**。首次登录后请立即在右上角用户菜单修改密码；生产环境应在 `.env` 中设置更强的初始密码。

### 首次启动会发生什么

1. 创建 SQLite 数据库和数据目录。
2. 写入管理员账号。
3. `SEED_DEMO_DATA=true` 时写入演示商品、仓库、供应商/客户；设为 `false` 则从空库开始。
4. 如果商品被清空但仓库仍在，`seed_demo` 会跳过演示数据，不会重复插入 SH/GZ。

## 使用流程

推荐按以下顺序开始：

1. **建档**：维护商品、仓库、供应商、客户；商品设置安全库存。
2. **做单**：入库单保存草稿 → 核对 → 确认入库；出库/调拨同理，确认动作才会改变库存。
3. **盘点**：按仓库冻结账面数量，录入实盘，完成时自动生成盘盈/盘亏流水。
4. **看报表**：库存汇总、低库存、收发存、流水；需要时导出 CSV。
5. **用 AI**：在“AI 助手”上传购买截图、商品链接或文字描述，核对预览后确认入库。

## 目录结构

```text
backend/
  app/
    core/            配置、数据库、安全、权限、审计、单号
    modules/         auth users products warehouses partners inventory
                     inbound outbound transfers stocktakes reports dashboard
                     audit system ai
    seed.py          演示数据与管理员初始化
    main.py          FastAPI 应用、路由注册、静态前端
  requirements.txt
frontend/
  src/
    components/      layout、ui、common、onboarding
    pages/           dashboard、products、orders、reports、ai、settings ...
    hooks/           API、鉴权、引导
    lib/             API 客户端、类型、工具
  dist/              预构建产物（Docker 直接复制）
doc/                 01–14 设计/测试/部署/用户手册
scripts/             启动、停止、备份、E2E、安全、Docker 校验
data/                运行期 SQLite 与 secret.key（不提交）
```

## 配置

复制 `.env.example` 为 `.env`：

| 变量 | 默认 | 说明 |
|---|---|---|
| `APP_PORT` | `8000` | Docker 映射到宿主机的端口 |
| `SECRET_KEY` | 自动生成 | JWT 签名密钥，生产建议显式设置 ≥32 字节 |
| `ADMIN_INITIAL_PASSWORD` | `Admin@12345` | 仅首次建库创建 admin 时使用 |
| `COOKIE_SECURE` | `false` | HTTPS 部署必须为 `true` |
| `ENABLE_DOCS` | `false` | 是否暴露 `/api/docs` |
| `APP_TIMEZONE` | `Asia/Shanghai` | “今日”、报表日期口径 |
| `SEED_DEMO_DATA` | `true` | 首次建库是否写入演示主数据 |

AI 配置不在 `.env`：DeepSeek Key、Ollama 地址与模型、默认提示词、自动确认开关都在应用内 **系统设置** 页保存。Docker 内访问宿主 Ollama 时地址填 `http://host.docker.internal:11434`；Linux 用 `http://172.17.0.1:11434`。

## 数据与备份

- Docker：命名卷 `lager_data`，数据库在容器内 `/app/data/lager.db`。
- Windows：`data\lager.db` 与 `data\secret.key`。
- 备份：`bash backup.sh`（Docker/本地）或双击 `backup.bat`（Windows），输出到 `backups/`。
- 恢复：停止服务 → 用备份替换 `lager.db` → 启动。

SQLite 运行中不要只复制 `lager.db` 而忽略 `-wal`/`-shm`；请使用备份脚本，或停服后复制整个 `data` 目录。

## 测试与验收

- 后端 E2E：**143/143** 通过。
- AI 全链路：**29/29** 通过（设置、Key 加密、分析、导入、库存、重复令牌、SSRF、图片 content parts）。
- 安全专项：**15/15** 通过。
- 覆盖率：**90%**（所有业务 service ≥ 80%）。
- 前端：桌面 **21 条路由**、移动端 **21/21 路由** 无横向溢出；全量 UI 交互（CRUD、确认、库存不足、盘点、用户、报表、设置、AI、批量清除）通过。
- 性能：200 行入库确认 165.9 ms；4.4 万行流水 CSV 1.48 s。详见 [性能报告](doc/performance-report.md)。
- Windows `start.bat` 与备份脚本已实测。
- 本机没有 Docker，Docker 镜像未实际构建；`verify_docker.py` 静态检查通过，详见 [测试报告](doc/test-report.md)。

## 开发

```bash
# 后端
python -m venv .venv
.venv\Scripts\activate              # Windows
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --reload

# 前端（另一个终端）
cd frontend
pnpm install
pnpm dev
```

前端开发服务器 `http://127.0.0.1:5173` 会把 `/api` 代理到 `127.0.0.1:8000`。

常用验证命令：

```bash
python scripts/e2e_test.py
python scripts/security_check.py
python scripts/ai_e2e_test.py
python scripts/verify_docker.py
```

## API 与文档

- 健康检查：`GET /api/v1/system/health`
- OpenAPI：`ENABLE_DOCS=true` 后访问 `/api/docs`

设计文档：

- [产品需求](doc/01-product-requirements.md)
- [系统架构](doc/02-architecture.md)
- [数据模型](doc/03-data-model.md)
- [API 规范](doc/04-api-spec.md)
- [界面设计](doc/05-ui-design.md)
- [安全设计](doc/06-security.md)
- [性能设计](doc/07-performance.md)
- [测试计划](doc/08-testing.md)
- [部署运维](doc/09-deployment.md)
- [实施路线图](doc/10-roadmap.md)
- [用户手册](doc/11-user-manual.md)
- [测试报告](doc/test-report.md)
- [性能报告](doc/performance-report.md)
- [AI 与引导](doc/14-ai-and-onboarding.md)

## 安全提示

- 公网部署必须使用 HTTPS，并设置 `COOKIE_SECURE=true`。
- 修改默认管理员密码，为每位员工建立独立账号。
- 不要共享 `SECRET_KEY`，不要提交 `.env` 或 `data/`。
- 生产环境建议关闭 `ENABLE_DOCS`，并定期备份与演练恢复。
- AI Key 加密存储；截图只在内存中处理；链接抓取有 SSRF 防护，但仍建议只粘贴可信来源。

## 常见问题

**8000 端口被占用？**  
Windows 双击 `stop.bat`；它只会停止健康检查确认为 Lager 的 python 进程，不会误杀其他程序。Docker 部署可改 `.env` 的 `APP_PORT`。

**Docker 基础镜像拉不下来？**  
使用 `PYTHON_IMAGE=python:3.11-slim-bookworm` 或公司内网镜像；apt/pip 仍会走 USTC/TUNA。

**Ollama 连接正常但模型不存在？**  
在“系统设置 → AI 提供商 → Ollama”点“获取模型”，从 `/api/tags` 返回的列表选择；不要手写不存在的标签。

**AI 上传图片报 413？**  
单张图片上限 4 MB，请求体上限 6 MB；压缩截图或裁剪后再上传。

**忘记管理员密码？**  
停服后使用备份/数据库工具重置，或在首次建库前通过 `ADMIN_INITIAL_PASSWORD` 设置；生产环境请保留管理员恢复流程。

---

Lager v1.1.0 · 本地优先，数据自主可控。
