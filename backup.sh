#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/lager-${STAMP}.db"
mkdir -p backups

if docker compose version >/dev/null 2>&1 && docker compose ps --status running --services 2>/dev/null | grep -qx lager; then
  echo "[INFO] 从运行中的容器在线备份 SQLite..."
  docker compose exec -T lager python -c "
import sqlite3
src = sqlite3.connect('/app/data/lager.db')
dst = sqlite3.connect('/app/data/.backup-tmp.db')
src.backup(dst)
dst.close(); src.close()
"
  docker cp lager:/app/data/.backup-tmp.db "$OUT"
  docker compose exec -T lager rm -f /app/data/.backup-tmp.db
else
  DB="data/lager.db"
  if [ ! -f "$DB" ]; then
    echo "[ERROR] 未找到 $DB，且容器未运行。" >&2
    exit 1
  fi
  echo "[INFO] 从本地数据文件在线备份 SQLite..."
  python3 - "$DB" "$OUT" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
PY
fi

echo "[OK] 备份完成：$OUT"
