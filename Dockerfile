# Lager ERP · 单镜像运行时
#
# 构建策略：
# - 默认基础镜像走 DaoCloud 中国加速（可用 PYTHON_IMAGE 覆盖为官方/内网镜像）
# - Debian apt 走中科大 USTC，Python 包走清华 TUNA
# - 前端使用仓库内已构建的 frontend/dist，构建阶段不再下载 Node/pnpm 依赖
# - 运行时非 root、只读根文件系统（由 compose 强制）、SQLite 持久化到 /app/data

ARG PYTHON_IMAGE=docker.m.daocloud.io/library/python:3.11-slim-bookworm
FROM ${PYTHON_IMAGE}

ARG APT_MIRROR=mirrors.ustc.edu.cn
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Shanghai \
    HOME=/tmp \
    TMPDIR=/tmp

# 只安装运行必需的系统包；apt 源切换为 USTC，避免访问 deb.debian.org。
RUN set -eux; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i \
        -e "s|http://deb.debian.org/debian|http://${APT_MIRROR}/debian|g" \
        -e "s|http://security.debian.org/debian-security|http://${APT_MIRROR}/debian-security|g" \
        /etc/apt/sources.list; \
    fi; \
    if [ -d /etc/apt/sources.list.d ]; then \
      find /etc/apt/sources.list.d -name '*.sources' -exec sed -i \
        -e "s|http://deb.debian.org/debian|http://${APT_MIRROR}/debian|g" \
        -e "s|http://security.debian.org/debian-security|http://${APT_MIRROR}/debian-security|g" \
        {} +; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates tzdata passwd; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --retries 5 --timeout 60 -r requirements.txt

# 创建运行用户，并在 COPY 时直接设置属主，减少镜像层。
RUN groupadd --gid 10001 lager \
    && useradd --uid 10001 --gid lager --home-dir /app --shell /usr/sbin/nologin --no-create-home lager \
    && mkdir -p /app/data /app/frontend \
    && chown -R lager:lager /app/data

COPY --chown=lager:lager backend/app/ ./app/
COPY --chown=lager:lager frontend/dist/ /app/frontend/dist/

# 关键路径检查：缺少 dist 时在构建期失败，而不是运行时空白页。
RUN test -f /app/frontend/dist/index.html

ENV PYTHONPATH=/app/backend \
    DATABASE_URL=sqlite:////app/data/lager.db \
    FRONTEND_DIST=/app/frontend/dist \
    ENABLE_DOCS=false \
    APP_TIMEZONE=Asia/Shanghai \
    SEED_DEMO_DATA=true

USER lager

EXPOSE 8000
VOLUME ["/app/data"]
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/system/health', timeout=3).read()"]

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--no-server-header"]
