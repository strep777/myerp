#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] 未找到 docker compose。" >&2
  exit 1
fi

docker compose stop
echo "[OK] Lager 已停止，数据卷 lager_data 保留。"
