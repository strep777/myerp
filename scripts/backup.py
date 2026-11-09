"""Create a consistent SQLite backup while Lager is running.

Usage: python scripts/backup.py [--database PATH] [--output-dir PATH]
"""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Backup Lager SQLite database")
    parser.add_argument("--database", default=str(root / "data" / "lager.db"))
    parser.add_argument("--output-dir", default=str(root / "backups"))
    args = parser.parse_args()

    source = Path(args.database)
    output_dir = Path(args.output_dir)
    if not source.is_file():
        print(f"[ERROR] 数据库不存在：{source}")
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = output_dir / f"lager-{stamp}.db"

    src = sqlite3.connect(str(source))
    dst = sqlite3.connect(str(target))
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()

    size = target.stat().st_size
    print(f"[OK] 备份完成：{target} ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
