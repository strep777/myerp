# Lager 仓储管理系统

Lager 是一套面向中小团队的单仓/多仓 ERP 仓储管理软件。它把入库、出库、调拨、盘点、库存余额与流水放在同一个简洁的 macOS 风格界面中，数据存储使用 SQLite，部署只需要一条 Docker Compose 命令或双击一个 Windows 脚本。

## 功能

- 登录、HttpOnly Cookie 会话、四角色权限（管理员 / 经理 / 操作员 / 只读）
- 工作台：库存 KPI、7 天出入库趋势、最近单据、低库存提醒
- 主数据：商品、仓库、供应商、客户
- 库存：实时余额、不可变流水、低库存筛选、商品页统一清空库存、移动加权平均成本
- 单据：入库、出库、调拨，草稿编辑、确认、取消、删除
- 盘点：仓库快照、实盘录入、差异入账、防并发错账
- 报表：库存汇总、低库存、收发存、流水，CSV 导出
- 全选与批量清除：所有业务列表支持当前页全选/取消/复制；可删除档案与草稿单据支持二次确认后批量清除，失败项保留并提示
- 新手指引：Intro.js 逐步高亮导航与 AI，桌面/移动端可用
- AI 智能入库：DeepSeek（默认）或本地 Ollama（模型从 `/api/tags` 动态读取）；可编辑提示词；截图（上传/拖拽/`Ctrl+V` 粘贴）、链接或文字分析 → 预览 → 确认入库
- 系统：用户管理、审计日志、系统设置、系统信息与健康检查
- 部署：Ubuntu Docker Compose 一键启动；Windows `start.bat` 一键启动

## 技术栈

- 前端：React 18、Vite 6、TypeScript、Tailwind CSS 3、Radix UI、lucide、sonner、Intro.js
- 后端：FastAPI、SQLAlchemy 2、Pydantic 2、SQLite（WAL）、httpx、Fernet
- AI：DeepSeek OpenAI 兼容接口；Ollama `/api/chat`；图片/链接/文字三种来源
- 部署：Docker 多阶段构建、非 root、只读根文件系统、健康检查

## 快速开始

### Ubuntu / Linux（Docker Compose，推荐）

```bash
cd /opt/lager
cp .env.example .env        # 可选：生产环境填写 SECRET_KEY 与管理员初始密码
bash start.sh
```

或手动：

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8000/api/v1/system/health
```

浏览器打开 `http://<服务器IP>:8000`。

### Windows（本机 Python）

1. 安装 Python 3.9+，安装时勾选 **Add Python to PATH**。
2. 双击 `start.bat`。脚本会创建 `.venv`、安装依赖，并在缺少 `frontend/dist` 时尝试用 pnpm 构建前端。
3. 启动成功后终端会显示 `http://127.0.0.1:8000`；为避免 Edge 权限冲突，脚本不会自动打开浏览器，请手动打开该地址。若已有 Lager 在运行，会直接复用，不会重复启动。

停止：在启动窗口按 `Ctrl+C`，或双击 `stop.bat`。

### 默认管理员

| 用户名 | 密码 |
|---|---|
| `admin` | `Admin@12345` |

首次登录后请立即在右上角用户菜单中修改密码。生产环境应通过 `.env` 的 `ADMIN_INITIAL_PASSWORD` 设置更强的初始密码。

## 配置

复制 `.env.example` 为 `.env`：

| 变量 | 默认 | 说明 |
|---|---|---|
| `APP_PORT` | `8000` | Docker 映射端口 |
| `SECRET_KEY` | 自动生成 | JWT 签名密钥，生产建议显式设置 ≥32 字节 |
| `ADMIN_INITIAL_PASSWORD` | `Admin@12345` | 仅在首次建库创建 admin 时使用 |
| `COOKIE_SECURE` | `false` | HTTPS 部署必须为 `true` |
| `ENABLE_DOCS` | `false` | 是否暴露 `/api/docs` |
| `APP_TIMEZONE` | `Asia/Shanghai` | “今日”、报表日期口径 |
| `SEED_DEMO_DATA` | `true` | 首次建库是否写入演示主数据 |

AI 的 DeepSeek Key、Ollama 地址、默认提示词和自动确认开关在应用内 **系统设置** 页配置，不写入 `.env`。Ollama 模型不再写死：设置页点“获取模型”从本机 `/api/tags` 读取下拉列表；当前标签不在列表时显示“未在列表”。Docker 内访问宿主 Ollama 时地址填 `http://host.docker.internal:11434`；Linux 用 `http://172.17.0.1:11434`。

## 数据与备份

- Docker：命名卷 `lager_data`，容器内 `/app/data/lager.db`。
- Windows：`data\lager.db` 与 `data\secret.key`。
- 备份：`bash backup.sh`（Docker/本地）或双击 `backup.bat`（Windows）。备份输出到 `backups/`。
- 恢复：停止服务 → 用备份替换 `lager.db` → 启动。

SQLite 运行中不要只复制 `lager.db` 而忽略 `-wal`/`-shm`；请使用备份脚本或停服后复制整个 `data` 目录。

## 验收状态

- 后端 E2E：**143/143** 通过；行覆盖率 **90%**（所有业务 service ≥ 80%）。
- AI 全链路：**29/29** 通过（设置、加密、分析、导入、库存、重复令牌、SSRF、图片 content parts）。
- 安全专项：**15/15** 通过。
- 前端：桌面 **21 条路由**、移动端 **21/21 路由** 无横向溢出；全量 UI 交互（CRUD、确认、库存不足、盘点、用户、报表、设置、AI、批量清除）通过。
- 性能：200 行入库确认 165.9 ms；4.4 万行流水 CSV 1.48 s；详见 [性能报告](doc/performance-report.md)。
- Windows `start.bat` 与备份脚本已实测；本机无 Docker，Docker 镜像未实际构建，compose 仅静态校验。

完整结果与未验证项见 [测试报告](doc/test-report.md)。

## 开发

```bash
# 后端
python -m venv .venv
.venv\Scripts\activate              # Windows
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --reload

# 前端
cd frontend
pnpm install
pnpm dev
```

前端开发服务器 `http://127.0.0.1:5173` 会把 `/api` 代理到 `127.0.0.1:8000`。

## 文档

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
