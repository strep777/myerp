@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Lager ERP Launcher
cd /d "%~dp0"
set "ROOT=%CD%"

echo.
echo  ==========================================
echo    Lager 仓储管理系统 - Windows 启动器
echo  ==========================================
echo.

if not exist "backend\app\main.py" (
  echo [ERROR] 未找到 backend\app\main.py，请在项目根目录运行。
  goto :fail
)

if not exist ".venv\Scripts\python.exe" (
  echo [INFO] 未找到虚拟环境，正在创建 .venv ...
  where python >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] 未找到 Python。请安装 Python 3.9+ 并勾选 Add Python to PATH。
    goto :fail
  )
  python -m venv .venv
  if errorlevel 1 goto :fail
  echo [INFO] 安装后端依赖（首次需要联网）...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
  if errorlevel 1 goto :fail
)

set "PYTHON=%ROOT%\.venv\Scripts\python.exe"

"%PYTHON%" -c "import fastapi, httpx, cryptography, python_multipart" >nul 2>nul
if errorlevel 1 (
  echo [INFO] 检测到后端依赖缺失，正在安装（需要联网）...
  "%PYTHON%" -m pip install -r backend\requirements.txt
  if errorlevel 1 goto :fail
)

if not exist "frontend\dist\index.html" (
  echo [INFO] 未找到前端构建产物，尝试构建（需要 Node 20+ 与 pnpm）...
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] 未找到 pnpm。请安装 Node 20+，执行 npm i -g pnpm@11，或先在有 Node 的机器上构建 frontend\dist。
    goto :fail
  )
  pushd frontend
  call pnpm install --frozen-lockfile
  if errorlevel 1 (
    popd
    goto :fail
  )
  call pnpm build
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
)

if not exist "data" mkdir "data"
set "APP_TIMEZONE=Asia/Shanghai"

if not exist "scripts\launcher.py" (
  echo [ERROR] 未找到 scripts\launcher.py，请重新解压完整交付包。
  goto :fail
)

echo [INFO] 正在启动 Lager（不会自动打开 Edge，避免权限冲突）...
echo.

"%PYTHON%" scripts\launcher.py
set "EXITCODE=%ERRORLEVEL%"
echo.
echo [INFO] 启动器已退出。
pause
exit /b %EXITCODE%

:fail
echo.
echo [FAILED] 启动失败，请查看上方错误信息。
pause
exit /b 1
