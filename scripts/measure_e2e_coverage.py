"""Run the E2E suite against an in-process Uvicorn so coverage can measure it.

Usage (from F:/erp/backend):
    ..\\.venv\\Scripts\\coverage.exe run --source=app --concurrency=thread ^
        ..\\scripts\\measure_e2e_coverage.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
PORT = 8013
BASE = f"http://127.0.0.1:{PORT}"

os.environ["DATABASE_URL"] = "sqlite:///F:/erp/data/coverage.db"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["ENABLE_DOCS"] = "false"
os.environ["PYTHONIOENCODING"] = "utf-8"
sys.path.insert(0, str(BACKEND))

import uvicorn  # noqa: E402
from app.main import app  # noqa: E402


def wait_health(timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(BASE + "/api/v1/system/health", timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("server did not become healthy")


def main() -> int:
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    wait_health()

    completed = subprocess.run(
        [str(PYTHON), str(ROOT / "scripts" / "e2e_test.py"), BASE],
        cwd=str(BACKEND),
    )

    server.should_exit = True
    thread.join(timeout=15)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
