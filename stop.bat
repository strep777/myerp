@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Lager ERP Stop
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] 未找到 .venv\Scripts\python.exe，请在项目根目录运行。
  pause
  exit /b 1
)

".venv\Scripts\python.exe" "scripts\stopper.py" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" pause
exit /b %RC%
