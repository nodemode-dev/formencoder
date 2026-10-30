@echo off
setlocal
cd /d "%~dp0.."
call setup\build_frontend.bat || exit /b 1
call setup\freeze_backend.bat || exit /b 1
if defined FORMENCODER_TARGET ( set "TRIPLE=%FORMENCODER_TARGET%" ) else ( for /f "tokens=2" %%t in ('rustc -vV ^| findstr /b "host:"') do set "TRIPLE=%%t" )
backend\venv\Scripts\python.exe setup\bundle_ffmpeg.py --target %TRIPLE% || exit /b 1
call frontend\node_modules\.bin\tauri.cmd build %* || exit /b 1
echo [formencoder] bundles are in src-tauri\target\release\bundle
