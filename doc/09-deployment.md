# Lager 仓储 · 部署与运维

版本：1.1  
日期：2026-11-09  
目标：Ubuntu 一条命令启动；Windows 双击 bat 启动；数据持久、可备份  
关联：[架构](02-architecture.md)、[安全](06-security.md)

## 1. 交付形态

```text
F:\erp\
├─ backend/                 # FastAPI 应用
├─ frontend/                # Vite 源码与 dist
├─ doc/                     # 全部文档
├─ data/                    # SQLite、secret.key（运行时生成，不入库）
├─ Dockerfile               # 多阶段构建（根目录）
├─ docker-compose.yml
├─ .env.example
├─ .dockerignore
├─ start.bat                # Windows 一键启动
├─ stop.bat                 # Windows 停止
├─ start.sh                 # Ubuntu 一键（docker compose）
├─ backup.bat / backup.sh   # 备份
└─ README.md
```

## 2. 环境要求

| 方式 | 要求 |
|---|---|
| Docker（推荐） | Docker Engine 24+，Compose v2；2 GB 内存；1 GB 磁盘 |
| Windows 本机 | Windows 10/11；Python 3.9+（推荐 3.11）；Node 20+ 仅在需要构建前端时 |
| 浏览器 | Chrome/Edge/Firefox/Safari 最新版 |
| 网络 | 首次构建需访问 npm/pypi；运行时可离线 |
| AI（可选） | DeepSeek 需出站 HTTPS 与 API Key；Ollama 需本机/内网服务与模型 |

## 3. 配置项

| 变量 | 默认 | 说明 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./data/lager.db` | SQLite 路径；Docker 内为 `sqlite:////app/data/lager.db` |
| `SECRET_KEY` | 自动生成 `data/secret.key` | JWT 密钥，≥32 字节；生产建议显式设置 |
| `ADMIN_INITIAL_PASSWORD` | `Admin@12345` | 仅首次建库时创建 admin 使用；**部署后立即修改** |
| `COOKIE_SECURE` | `false` | HTTPS 必须 `true` |
| `ENABLE_DOCS` | 开发 `true`，生产建议 `false` | 是否暴露 `/api/docs` |
| `APP_TIMEZONE` | `Asia/Shanghai` | 报表/“今日”日期口径 |
| `CORS_ORIGINS` | 空 | 仅开发跨域需要，逗号分隔 |
| `LOG_LEVEL` | `INFO` | `DEBUG/INFO/WARNING/ERROR` |
| `SEED_DEMO_DATA` | `true` | 首次建库是否写入演示商品/仓库/往来单位 |
| `APP_PORT` | `8000` | Compose 映射到宿主机的端口 |
| `FRONTEND_DIST` | 自动定位 `frontend/dist` | 静态文件目录，Docker 显式设置 |

`.env.example`：

```dotenv
# 复制为 .env 后修改；不要提交真实密钥
SECRET_KEY=
ADMIN_INITIAL_PASSWORD=Admin@12345
COOKIE_SECURE=false
ENABLE_DOCS=false
APP_TIMEZONE=Asia/Shanghai
LOG_LEVEL=INFO
SEED_DEMO_DATA=true
APP_PORT=8000
```

生成密钥：

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

AI 配置不放在 `.env`：DeepSeek Key、Ollama 地址与模型、默认提示词都在“系统设置”页保存。Key 使用 Fernet 加密落库；修改 `SECRET_KEY` 后旧 Key 无法解密，需要在设置页重新填写。

### 3.1 Ollama 与 Docker 网络

| 部署方式 | Ollama 地址 |
|---|---|
| Windows 本机 | `http://127.0.0.1:11434` |
| Docker Desktop（Windows/macOS 宿主） | `http://host.docker.internal:11434` |
| Linux 宿主机 | `http://172.17.0.1:11434`（或实际网桥网关） |

Ollama 默认只监听 `127.0.0.1`。容器访问宿主机时需设置 `OLLAMA_HOST=0.0.0.0:11434` 并只在内网暴露；不要把 11434 直接暴露公网。

DeepSeek 模式需要容器可出站访问 `https://api.deepseek.com`。若使用代理，在设置页把服务地址改为代理的 OpenAI 兼容地址。

## 4. Ubuntu · Docker Compose（推荐）

### 4.1 一键启动

```bash
cd /opt/lager            # 项目目录
cp .env.example .env     # 可选：填写 SECRET_KEY 与管理员初始密码
docker compose up -d --build
docker compose ps
```

访问：`http://<服务器IP>:8000`  
健康检查：`curl http://127.0.0.1:8000/api/v1/system/health`

首次启动自动：
1. 创建 `/app/data`（命名卷 `lager_data`）；
2. 建表；
3. 若无用户，创建 `admin`（密码来自 `ADMIN_INITIAL_PASSWORD`）；`SEED_DEMO_DATA=true` 时写入示例主数据；
4. 生成 `secret.key`（若未提供 `SECRET_KEY`）。

### 4.2 查看状态与日志

```bash
docker compose ps
docker compose logs -f --tail=200 lager
docker stats lager --no-stream
```

### 4.3 停止/重启/升级

```bash
docker compose stop          # 停止，保留容器与卷
docker compose restart       # 重启
docker compose down          # 删除容器，保留命名卷
docker compose up -d --build # 重新构建并启动（升级）
```

升级前必须备份（见第 8 节）。v1 使用 `create_all`，不自动迁移旧表结构；跨版本升级需按发布说明处理。

### 4.4 修改配置

```bash
vi .env
docker compose up -d         # 重建容器使环境变量生效
```

修改 `SECRET_KEY` 会使所有会话失效；修改 `ADMIN_INITIAL_PASSWORD` 不影响已存在用户。

### 4.5 端口与反向代理

默认映射 `8000:8000`。公网部署建议仅监听本机并由 Nginx/Caddy 提供 HTTPS：

```yaml
ports:
  - "127.0.0.1:8000:8000"
```

Nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name erp.example.com;

    ssl_certificate     /etc/letsencrypt/live/erp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.example.com/privkey.pem;

    client_max_body_size 1m;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # AI 分析可能上传 4MB 图片、等待模型 30 秒以上
    location = /api/v1/ai/analyze {
        client_max_body_size 6m;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }

    # 可选：登录接口限流
    limit_req_zone $binary_remote_addr zone=login:10m rate=10r/m;
    location = /api/v1/auth/login {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://127.0.0.1:8000;
        include proxy_params;
    }
}
```

启用 HTTPS 后必须设置 `COOKIE_SECURE=true`，否则浏览器不会在 HTTPS 下发送非 Secure Cookie 的行为差异会导致登录异常（实际是 Cookie 被拒/不发送）。

## 5. Windows · 本机一键启动

### 5.1 首次准备

- 安装 Python 3.9+，勾选 “Add Python to PATH”。
- 如需现场构建前端：安装 Node 20+ 与 pnpm（`npm i -g pnpm`）。
- 将项目放在无特殊权限要求的目录（如 `F:\erp`）。

### 5.2 双击 `start.bat`

脚本流程：

```text
1. 切到脚本目录
2. 检查 python
3. 创建 .venv（若不存在）
4. 升级 pip（静默）并安装 backend/requirements.txt
5. 若 frontend/dist/index.html 不存在：
     检查 node/pnpm → pnpm install → pnpm build
     无 node 则报错并退出（提示先构建或安装 Node）
6. 由 scripts/launcher.py 设置 DATABASE_URL=sqlite:///F:\erp\data\lager.db（绝对路径）
7. 检测 8000 端口：已有健康 Lager 则复用并退出；被其他程序占用则报错
8. 启动 uvicorn 127.0.0.1:8000，轮询健康接口
9. 打印访问地址与初始账号；不自动启动浏览器（避免 Edge 提权冲突）
```

停止：在启动窗口按 `Ctrl+C`，或双击 `stop.bat`。`stop.bat` 调用 `scripts/stopper.py`，只有“8000 端口 LISTENING + `/api/v1/system/health` 返回 Lager + 进程名为 python”三者同时匹配才停止；8000 被其他程序占用时拒绝并打印 PID，不会误杀 DSH/其他 Python。关闭窗口会同时终止子进程，但不便于优雅退出。

### 5.3 手动启动（排障用）

```bat
cd /d F:\erp
.venv\Scripts\activate
set DATABASE_URL=sqlite:///F:/erp/data/lager.db
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

前端开发模式：

```bat
cd frontend
pnpm install
pnpm dev
```

Vite 将 `/api` 代理到 `http://127.0.0.1:8000`。

### 5.4 数据位置

`F:\erp\data\lager.db`；`data\secret.key`。备份整个 `data` 目录即可（建议先停止服务）。

## 6. Dockerfile 设计要求

多阶段：

```dockerfile
# 阶段 1：前端构建
FROM node:20-alpine AS web
WORKDIR /web
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# 阶段 2：运行
FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/dist ./frontend/dist
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin lager \
 && mkdir -p /app/data && chown -R lager:lager /app
USER lager
ENV DATABASE_URL=sqlite:////app/data/lager.db \
    FRONTEND_DIST=/app/frontend/dist \
    ENABLE_DOCS=false \
    PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/system/health', timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

要点：
- 前端构建在独立阶段，运行镜像不含 Node。
- 非 root（UID 10001）；`/app/data` 属主可写。
- 单 worker（SQLite 写串行、内存限流一致）。
- 不复制 `.env`、`data/`、测试文件。

## 7. docker-compose.yml 设计要求

```yaml
services:
  lager:
    build: .
    image: lager-erp:1.1.0
    container_name: lager
    restart: unless-stopped
    ports:
      - "${APP_PORT:-8000}:8000"
    environment:
      DATABASE_URL: sqlite:////app/data/lager.db
      SECRET_KEY: ${SECRET_KEY:-}
      ADMIN_INITIAL_PASSWORD: ${ADMIN_INITIAL_PASSWORD:-Admin@12345}
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
      ENABLE_DOCS: ${ENABLE_DOCS:-false}
      APP_TIMEZONE: ${APP_TIMEZONE:-Asia/Shanghai}
      LOG_LEVEL: ${LOG_LEVEL:-INFO}
      SEED_DEMO_DATA: ${SEED_DEMO_DATA:-true}
    volumes:
      - lager_data:/app/data
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/system/health', timeout=3)"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  lager_data:
```

注意：
- `read_only: true` 下，Python 不能写 `__pycache__`；镜像已设 `PYTHONDONTWRITEBYTECODE=1`。
- Uvicorn 不需要写工作目录；临时文件写 `/tmp`。
- 若使用绑定挂载 `./data:/app/data`，需确保宿主目录对 UID 10001 可写：`sudo chown -R 10001:10001 ./data`。
- 命名卷更省心，备份通过 `docker cp` 或临时容器。

## 8. 备份与恢复

### 8.1 Docker（命名卷）

```bash
# 在线安全备份（SQLite .backup，需容器内有 sqlite3；若无则先安装或用 Python）
docker compose exec lager python - <<'PY'
import sqlite3
src = sqlite3.connect('/app/data/lager.db')
dst = sqlite3.connect('/app/data/backup-tmp.db')
src.backup(dst)
dst.close(); src.close()
PY
docker cp lager:/app/data/backup-tmp.db ./lager-backup-$(date +%F).db
docker compose exec lager rm -f /app/data/backup-tmp.db
```

更简单：低峰期 `docker compose stop` 后：

```bash
docker run --rm -v lager_lager_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/lager-data-$(date +%F).tar.gz -C /data .
docker compose start
```

恢复：

```bash
docker compose down
docker run --rm -v lager_lager_data:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/lager-data-YYYY-MM-DD.tar.gz -C /data"
docker compose up -d
```

### 8.2 Windows

停止服务后复制 `F:\erp\data` 到备份位置；或使用 `backup.bat`（调用 Python sqlite3 backup）。

恢复：停止 → 用备份替换 `data\lager.db` → 启动 → 验证。

### 8.3 建议

- 每日备份，保留 14 天；重大操作前手动备份。
- 备份异机/对象存储；加密；定期恢复演练。
- 不要只复制 `lager.db` 而忽略 `-wal`/`-shm`（运行中）；使用 `.backup` 或停服。

## 9. 健康检查与监控

```bash
curl -fsS http://127.0.0.1:8000/api/v1/system/health
# {"status":"ok","time":"2026-11-09T...","version":"1.1.0"}
```

- Docker healthcheck 已配置；`docker compose ps` 显示 healthy。
- 应用日志：`docker compose logs -f lager`；>500ms 请求会 WARN。
- 磁盘：`df -h`；数据库增长与备份空间。
- 建议外部 uptime 监控每 1 分钟探测 health。

## 10. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `port is already allocated` | 8000 被占用 | 改 compose 端口或停止占用进程 |
| 登录后立刻跳回登录 | HTTPS 下 `COOKIE_SECURE=false` 或 HTTP 下 `true` | 按协议设置；清 Cookie 重试 |
| `database is locked` | 并发写/长事务 | 重试；检查是否有外部工具占用；不要多 worker |
| 页面刷新 404 | 静态 SPA fallback 未生效 | 确认 `FRONTEND_DIST` 指向 dist；FastAPI 捕获全部非 `/api` 路由 |
| 前端空白 | dist 未构建/路径错 | 查看容器日志；本地 `pnpm build` |
| `Permission denied: /app/data` | 卷权限/UID 不匹配 | 命名卷重建或 chown 10001 |
| Windows 找不到 python | 未加 PATH | 重装勾选 PATH，或用 `py -3` |
| bat 中文乱码 | 代码页 | 脚本首行 `chcp 65001 >nul` |
| 构建慢/失败 | 网络 | 配置 npm/pip 镜像；重试 |
| Windows 启动报 `UNIQUE constraint failed: warehouses.code` | 商品已清空但仓库仍在，旧 seed 会重插 SH/GZ | v1.1 已修：`seed_demo` 检测到已有仓库或商品即跳过；更新代码后直接重启，不要删库 |
| AI 测试连接 502 / `AI_NETWORK_ERROR` | Ollama 未启动或地址不可达 | 宿主执行 `ollama serve`；Docker 内改用 `host.docker.internal` |
| AI 提示模型不存在 | 标签与 `ollama list` 不一致 | 在设置页点“获取模型”选择实际标签，或 `ollama pull <实际模型>`；不要手写不存在的标签 |
| AI 上传 413 | Nginx/服务端限制 | 确认 `/ai/analyze` 的 6 MB 与 180s 超时已配置 |
| 设置页显示 Key 未配置 | 未填或 `SECRET_KEY` 变化 | 重新填写 Key；检查 `data/secret.key` 未丢失 |
| 忘记管理员密码 | — | 停服后用脚本重置（见下） |

重置管理员密码（Docker）：

```bash
docker compose exec lager python - <<'PY'
from app.core.database import SessionLocal
from app.modules.users.models import User
from app.core.security import hash_password
db = SessionLocal()
u = db.query(User).filter(User.username == 'admin').first()
u.password_hash = hash_password('NewAdmin@2026')
u.token_version += 1
db.commit(); print('ok')
PY
```

（脚本需在应用代码可导入的 `/app` 工作目录执行。）

## 11. 升级与回滚

1. 备份数据库与 `.env`。
2. 拉取新代码；查看 `doc/10-roadmap.md` 的迁移说明。
3. `docker compose build --pull` → `docker compose up -d`。
4. 验证 health、登录、库存数量、最近单据。
5. 失败回滚：停止 → 恢复旧镜像 tag 与数据库备份 → 启动。

v1 无自动迁移；表结构变化需手工 SQL 或后续引入 Alembic。

## 12. 生产检查清单

- [ ] 修改默认管理员密码。
- [ ] 设置随机 `SECRET_KEY`（≥32 字节），不写入镜像。
- [ ] HTTPS + `COOKIE_SECURE=true`。
- [ ] `ENABLE_DOCS=false`。
- [ ] 仅暴露必要端口；数据库无外部端口。
- [ ] 容器非 root、`read_only`、`cap_drop: ALL`、`no-new-privileges`。
- [ ] 数据卷权限正确；每日备份并验证恢复。
- [ ] 主机防火墙、SSH 密钥、系统补丁。
- [ ] 为每位员工创建独立账号，不共享 admin。
- [ ] AI：按需配置 DeepSeek Key 或 Ollama；敏感数据场景优先本地 Ollama。
- [ ] AI：Nginx `/ai/analyze` 放行 6 MB 与 180s；11434 不对公网暴露。
- [ ] 监控 health 与磁盘；日志保留策略。
- [ ] 记录部署版本、时间、负责人。
