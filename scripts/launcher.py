#!/usr/bin/env python3
"""Lager Windows launcher.

Goals:
- never start a second uvicorn on port 8000;
- reuse an already healthy Lager instance instead of failing with WinError 10048;
- never auto-open Edge from an elevated console (avoids the Edge elevation prompt);
- handle Ctrl+C and report a useful error when the port belongs to another app.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
PORT = 8000
BASE_URL = f"http://{HOST}:{PORT}"
HEALTH_URL = f"{BASE_URL}/api/v1/system/health"
INFO_URL = f"{BASE_URL}/api/v1/system/info"
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
except Exception:
    pass


def _get_json(url: str, timeout: float = 1.5) -> Optional[dict]:
    try:
        with _OPENER.open(url, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, urllib.error.URLError):
        return None


def _port_open() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.6)
        return sock.connect_ex((HOST, PORT)) == 0


def _existing_lager() -> Optional[dict]:
    """Return health info when Lager is already serving, else None."""
    health = _get_json(HEALTH_URL)
    if not health or health.get("status") != "ok":
        return None
    info = _get_json(INFO_URL) or {}
    return {"health": health, "info": info}


def _listening_pids() -> list[str]:
    try:
        result = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
        )
    except OSError:
        return []
    pids: list[str] = []
    needle = f":{PORT}"
    for line in result.stdout.splitlines():
        if needle not in line or "LISTENING" not in line.upper():
            continue
        parts = line.split()
        if parts and parts[-1].isdigit():
            pids.append(parts[-1])
    return sorted(set(pids))


def _print_access() -> None:
    print()
    print(f"  服务地址: {BASE_URL}")
    print("  初始账号: admin")
    print("  初始密码: Admin@12345")
    print("  登录后请立即修改密码。")
    print()
    print("  为避免 Edge 权限冲突，启动器不会自动打开浏览器。")
    print("  请复制上面的地址到浏览器打开；停止服务按 Ctrl+C 或运行 stop.bat。")
    print()


def _fail(message: str) -> int:
    print(f"\n[ERROR] {message}\n")
    return 1


def main() -> int:
    if not (ROOT / "backend" / "app" / "main.py").exists():
        return _fail("未找到 backend/app/main.py，请从项目根目录启动。")
    if not (ROOT / "frontend" / "dist" / "index.html").exists():
        return _fail("未找到 frontend/dist/index.html，请先构建前端。")

    if _port_open():
        existing = None
        for _ in range(6):
            existing = _existing_lager()
            if existing:
                break
            time.sleep(0.4)
        if existing:
            version = existing["info"].get("version") or existing["health"].get("version") or "未知"
            print(f"\n[INFO] 检测到 Lager 已在运行（版本 {version}）。")
            print("[INFO] 不会重复启动第二个进程。")
            _print_access()
            return 0
        pids = _listening_pids()
        extra = f"（PID: {', '.join(pids)}）" if pids else ""
        return _fail(
            f"端口 {PORT} 已被其他程序占用{extra}。"
            "请关闭该程序，或先运行 stop.bat 清理残留服务后重试。"
        )

    data_dir = ROOT / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    database_path = (data_dir / "lager.db").as_posix()
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{database_path}"
    env["FRONTEND_DIST"] = str((ROOT / "frontend" / "dist").resolve())
    env["APP_TIMEZONE"] = "Asia/Shanghai"

    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--app-dir",
        str((ROOT / "backend").resolve()),
        "--host",
        HOST,
        "--port",
        str(PORT),
    ]

    print(f"\n[INFO] 启动后端，数据库：{env['DATABASE_URL']}")
    print("[INFO] 浏览器不会自动启动，启动成功后请手动打开下面地址。")
    try:
        process = subprocess.Popen(command, cwd=str(ROOT), env=env)
    except OSError as exc:
        return _fail(f"无法启动 Python 后端：{exc}")

    try:
        deadline = time.time() + 40
        ready = False
        while time.time() < deadline:
            if process.poll() is not None:
                break
            health = _get_json(HEALTH_URL, timeout=1.0)
            if health and health.get("status") == "ok":
                ready = True
                break
            time.sleep(0.4)

        if not ready:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
            return _fail("后端未能在 40 秒内就绪，请查看上方 uvicorn 日志。")

        _print_access()
        return process.wait()
    except KeyboardInterrupt:
        print("\n[INFO] 正在停止服务 ...")
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
