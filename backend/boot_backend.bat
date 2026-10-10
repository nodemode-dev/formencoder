@echo off
setlocal
cd /d "%~dp0"
if not exist venv\Scripts\activate.bat ( echo [formencoder] engine venv missing, run formencoder.bat install & exit /b 1 )
call venv\Scripts\activate.bat
if not defined FORMENCODER_PORT set "FORMENCODER_PORT=8270"
uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port %FORMENCODER_PORT%
