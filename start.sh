#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] 未找到 docker，请先安装 Docker Engine 与 Compose 插件。" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] 未找到 docker compose（Compose v2），请安装 compose 插件。" >&2
  exit 1
fi

if [ ! -f frontend/dist/index.html ]; then
  echo "[ERROR] 缺少 frontend/dist/index.html。" >&2
  echo "        请先在 frontend 目录执行 pnpm install && pnpm build，或使用包含 dist 的离线交付包。" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[INFO] 已生成 .env。生产部署请编辑其中的 SECRET_KEY 与 ADMIN_INITIAL_PASSWORD。"
fi

PORT="$(sed -n 's/^APP_PORT=//p' .env | tail -n 1 | tr -d '\r')"
PORT="${PORT:-8000}"

docker compose up -d --build
echo "[INFO] 等待服务健康检查..."
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/v1/system/health" >/dev/null 2>&1; then
    echo "[OK] Lager 已启动：http://127.0.0.1:${PORT}"
    echo "[INFO] 首次登录：admin / \${ADMIN_INITIAL_PASSWORD}（默认 Admin@12345，请立即修改）"
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "[WARN] 健康检查尚未通过，请执行：docker compose logs -f --tail=200 lager" >&2
docker compose ps
exit 2
