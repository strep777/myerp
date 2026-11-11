"""Static checks for the Docker deployment bundle.

This does not replace `docker compose build` (no daemon is available in the
authoring environment); it catches the common packaging mistakes early:

- compose YAML parses and keeps the hardened runtime options
- Dockerfile copies the prebuilt frontend and uses the expected layout
- .dockerignore does not exclude the files the image needs
"""

from __future__ import annotations

import fnmatch
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    print(f"[FAIL] {message}")
    raise SystemExit(1)


def main() -> None:
    compose_path = ROOT / "docker-compose.yml"
    if not compose_path.is_file():
        fail("docker-compose.yml missing")
    compose = yaml.safe_load(compose_path.read_text(encoding="utf-8"))
    service = (compose.get("services") or {}).get("lager")
    if not service:
        fail("compose service 'lager' missing")

    for key, expected in {
        "read_only": True,
        "cap_drop": ["ALL"],
        "init": True,
    }.items():
        if service.get(key) != expected:
            fail(f"compose {key} must be {expected!r}, got {service.get(key)!r}")
    if "lager_data:/app/data" not in service.get("volumes", []):
        fail("compose must mount lager_data at /app/data")
    if "healthcheck" not in service:
        fail("compose healthcheck missing")
    if not service.get("build", {}).get("args", {}).get("PYTHON_IMAGE"):
        fail("compose must pass PYTHON_IMAGE build arg")

    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    for token in (
        "backend/app/",
        "frontend/dist/",
        "PYTHON_IMAGE",
        "mirrors.ustc.edu.cn",
        "pypi.tuna.tsinghua.edu.cn",
        "USER lager",
        "HEALTHCHECK",
    ):
        if token not in dockerfile:
            fail(f"Dockerfile missing required token: {token}")

    if not (ROOT / "frontend" / "dist" / "index.html").is_file():
        fail("frontend/dist/index.html missing; build the frontend first")

    patterns = []
    for line in (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            patterns.append(line.rstrip("/"))

    def ignored(rel: str) -> bool:
        parts = rel.split("/")
        for end in range(1, len(parts) + 1):
            candidate = "/".join(parts[:end])
            for pattern in patterns:
                if fnmatch.fnmatch(candidate, pattern) or fnmatch.fnmatch(candidate, pattern + "/*"):
                    return True
        return False

    for required in ("frontend/dist/index.html", "backend/app/main.py", "backend/requirements.txt"):
        if ignored(required):
            fail(f".dockerignore excludes required file: {required}")

    print("[OK] compose YAML")
    print("[OK] hardened runtime options (read_only, cap_drop, volume, healthcheck)")
    print("[OK] Dockerfile layout and China mirrors")
    print("[OK] build context contains frontend/dist and backend files")
    print("DOCKER CONFIG OK")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover - diagnostic path
        print(f"[FAIL] {type(exc).__name__}: {exc}")
        sys.exit(1)
