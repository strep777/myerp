@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Lager ERP Backup
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] 未找到 .venv，请先运行 start.bat 完成环境安装。
  pause
  exit /b 1
)

".venv\Scripts\python.exe" "scripts\backup.py"
if errorlevel 1 (
  echo [ERROR] 备份失败。
  pause
  exit /b 1
)

pause
