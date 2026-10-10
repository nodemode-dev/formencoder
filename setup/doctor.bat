@echo off
setlocal
cd /d "%~dp0.."
echo [formencoder] doctor · windows
where node >nul 2>nul && ( for /f %%V in ('node -v') do echo   ok     node %%V ) || echo   FAIL   node · Node 20.19+ is required
where npm >nul 2>nul && echo   ok     npm || echo   FAIL   npm
py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>nul && echo   ok     python || echo   FAIL   python · Python 3.12+ is required
where cargo >nul 2>nul && echo   ok     rust || echo   FAIL   rust · the encoding engine needs Rust 1.95+
if exist backend\venv\Scripts\python.exe (
  backend\venv\Scripts\python.exe -c "import fe_core" >nul 2>nul && echo   ok     encoding engine || echo   FAIL   encoding engine · run formencoder.bat install-native
  backend\venv\Scripts\python.exe -c "import json, fe_core; raise SystemExit(0 if json.loads(fe_core.ffmpeg_info())['version'].get('found') else 1)" >nul 2>nul && echo   ok     ffmpeg || echo   warn   ffmpeg · not found, formencoder downloads its LGPL build on first start
) else ( echo   warn   engine venv · run formencoder.bat install )
if exist frontend\node_modules ( echo   ok     interface node_modules ) else ( echo   warn   interface deps · run formencoder.bat install )
for %%A in (claude codex cursor-agent) do ( where %%A >nul 2>nul && echo   ok     agent %%A || echo   warn   agent %%A · not on PATH, optional )
