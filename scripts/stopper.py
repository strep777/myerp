"""Safely stop the local Lager development server.

The old batch file killed whatever process owned port 8000.  On machines
where another tool (for example the DSH desktop app) happens to use 8000,
that could terminate the wrong process.  This helper verifies that the
listener is a Python process before asking for confirmation.
"""

from __future__ import annotations

import csv
import io
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Set

ROOT = Path(__file__).resolve().parent.parent
PORT = 8000
LISTEN_RE = re.compile(r":8000\s+\S+\s+LISTENING\s+(\d+)", re.IGNORECASE)


def _run(command: List[str]) -> str:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="mbcs",
            errors="replace",
            timeout=15,
        )
        return completed.stdout or ""
    except Exception:
        return ""


def _listening_pids() -> Set[int]:
    output = _run(["netstat", "-ano", "-p", "tcp"])
    pids: Set[int] = set()
    for line in output.splitlines():
        match = LISTEN_RE.search(line)
        if match:
            try:
                pids.add(int(match.group(1)))
            except ValueError:
                pass
    return pids


def _image_name(pid: int) -> str:
    output = _run(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"])
    row = next(csv.reader(io.StringIO(output)), None)
    name = row[0].strip() if row else ""
    if name:
        return name

    # Elevated/other-user processes can make tasklist return "Access denied".
    # Get-Process still works for the current user and is read-only.
    try:
        completed = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                (
                    "$ErrorActionPreference='Stop'; "
                    f"$p=Get-Process -Id {pid}; "
                    "Write-Output ($p.ProcessName + '|' + $p.Path)"
                ),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
        )
        text = (completed.stdout or "").strip()
        if text:
            return text.split("|", 1)[0].strip()
    except Exception:
        pass
    return ""


def _is_lager_health() -> bool:
    """Only stop port 8000 when it actually answers Lager's health contract."""
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"http://127.0.0.1:{PORT}/api/v1/system/health", timeout=3) as response:
            if response.status != 200:
                return False
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
            return isinstance(payload, dict) and payload.get("status") == "ok" and "version" in payload
    except Exception:
        return False


def _command_line(pid: int) -> Optional[str]:
    # wmic is deprecated but still present on many Windows 10/11 installs.
    # If it is unavailable we simply fall back to the image-name check.
    output = _run(["wmic", "process", "where", f"ProcessId={pid}", "get", "CommandLine", "/value"])
    for line in output.splitlines():
        line = line.strip()
        if line.lower().startswith("commandline="):
            return line[len("commandline=") :].strip()
    return None


def _confirm(question: str) -> bool:
    try:
        answer = input(question).strip().lower()
    except (EOFError, KeyboardInterrupt):
        return False
    return answer in {"y", "yes"}


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = set(sys.argv[1:])
    yes = "--yes" in args or "-y" in args or "/y" in args

    pids = sorted(_listening_pids())
    if not pids:
        print(f"[INFO] 未发现监听 {PORT} 端口的进程，服务可能已经停止。")
        return 0

    lager_pids: List[int] = []
    refused: List[str] = []
    lager_health = _is_lager_health()
    if not lager_health:
        print(f"[WARN] 端口 {PORT} 没有返回 Lager 健康检查；可能是其他工具占用。")
    for pid in pids:
        image = _image_name(pid)
        is_python = image.lower().startswith("python")
        print(f"[INFO] 端口 {PORT} -> PID {pid}，进程：{image or 'unknown'}")
        if not is_python or not lager_health:
            refused.append(f"PID {pid}（{image or 'unknown'}）看起来不是 Lager 后端")
            continue
        lager_pids.append(pid)

    if refused:
        print("[WARN] 为安全起见，以下进程未被停止：")
        for item in refused:
            print(f"  - {item}")
        print("[WARN] 请确认该端口是否被其他工具占用，不要直接按 PID 强杀。")
        if not lager_pids:
            return 1

    print(f"[INFO] 准备停止 Lager 后端进程：{', '.join(str(p) for p in lager_pids)}")
    if not yes and not _confirm("确定停止 Lager 吗？[y/N] "):
        print("[INFO] 已取消。")
        return 0

    failed = 0
    for pid in lager_pids:
        try:
            completed = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    (
                        "$ErrorActionPreference='Stop'; "
                        f"Stop-Process -Id {pid} -Force; Write-Output 'OK'"
                    ),
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=20,
            )
            output = (completed.stdout or "") + (completed.stderr or "")
            if output.strip():
                print(output.strip())
            if completed.returncode != 0:
                print("[INFO] 当前权限不足，正在请求管理员权限（UAC）…")
                elevated = subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        (
                            "$p=Start-Process -FilePath taskkill "
                            f"-ArgumentList '/PID {pid} /T /F' "
                            "-Verb RunAs -Wait -PassThru; exit $p.ExitCode"
                        ),
                    ],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=90,
                )
                if elevated.returncode != 0:
                    failed += 1
        except Exception:
            failed += 1
    if failed:
        print("[ERROR] 部分进程停止失败；请以管理员身份运行 stop.bat。")
        return 1
    print("[OK] Lager 服务已停止。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
