@echo off
setlocal
cd /d "%~dp0.."
if not exist backend\venv\Scripts\activate.bat ( echo [formencoder] engine venv missing, run formencoder.bat install & exit /b 1 )
call backend\venv\Scripts\activate.bat
where cargo >nul 2>nul || ( echo [formencoder] Rust is required for the encoding engine: https://rustup.rs & exit /b 1 )
set "PROFILE=--release"
for %%A in (%*) do (
  if /i "%%A"=="--dev" set "PROFILE="
)
python -c "import maturin" 2>nul || pip install "maturin>=1.15,<2"
pushd native\fencoder-py
maturin develop %PROFILE% || ( popd & exit /b 1 )
popd
python -c "import json, fe_core; c = json.loads(fe_core.Engine().execute('app.capabilities', '{}', 'setup')); print('[formencoder] engine', fe_core.__version__, 'ready:', c['commands'], 'commands,', c['formats'], 'formats,', c['presets'], 'presets')"
