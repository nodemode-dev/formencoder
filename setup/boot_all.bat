@echo off
setlocal
cd /d "%~dp0.."
start "formencoder engine" cmd /k "cd /d %cd%\backend && boot_backend.bat"
start "formencoder interface" cmd /k "cd /d %cd%\frontend && boot_frontend.bat"
echo [formencoder] interface http://localhost:5270 and engine http://127.0.0.1:8270
