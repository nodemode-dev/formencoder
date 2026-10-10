@echo off
setlocal
cd /d "%~dp0.."
if not exist frontend\dist\index.html call setup\build_frontend.bat
call backend\venv\Scripts\activate.bat
set "FORMENCODER_DIST=%cd%\frontend\dist"
cd backend
if not defined FORMENCODER_PORT set "FORMENCODER_PORT=8270"
echo [formencoder] serving http://127.0.0.1:%FORMENCODER_PORT%
uvicorn app.main:app --host 127.0.0.1 --port %FORMENCODER_PORT%
