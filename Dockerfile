# syntax=docker/dockerfile:1

# ---------- 阶段 1：构建前端 ----------
FROM node:22-alpine AS web

WORKDIR /web

# 固定 pnpm 版本，避免 corepack 自动选择导致锁文件不兼容
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml frontend/.npmrc ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

# ---------- 阶段 2：运行时 ----------
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=web /web/dist ./frontend/dist

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin lager \
    && mkdir -p /app/data \
    && chown -R lager:lager /app

USER lager

ENV DATABASE_URL=sqlite:////app/data/lager.db \
    FRONTEND_DIST=/app/frontend/dist \
    ENABLE_DOCS=false \
    APP_TIMEZONE=Asia/Shanghai

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/system/health', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
