@echo off
setlocal
cd /d "%~dp0.."
set "ROOT=%cd%"
if not exist backend\venv\Scripts\activate.bat ( echo [formencoder] engine venv missing, run formencoder.bat install & exit /b 1 )
call backend\venv\Scripts\activate.bat
python -c "import PyInstaller" >nul 2>nul || ( echo [formencoder] PyInstaller missing, run formencoder.bat install-desktop & exit /b 1 )
python -c "import fe_core" >nul 2>nul || ( echo [formencoder] the encoding engine is not built, run formencoder.bat install-native & exit /b 1 )
if defined FORMENCODER_TARGET ( set "TRIPLE=%FORMENCODER_TARGET%" ) else ( for /f "tokens=2" %%t in ('rustc -vV ^| findstr /b "host:"') do set "TRIPLE=%%t" )
if not defined TRIPLE ( echo [formencoder] rustc not found, install Rust or set FORMENCODER_TARGET & exit /b 1 )
if not exist frontend\dist\index.html call setup\build_frontend.bat
cd backend
if exist build\pyinstaller rmdir /s /q build\pyinstaller
if exist dist-engine rmdir /s /q dist-engine
pyinstaller --noconfirm --clean --onefile --name formencoder-engine --distpath dist-engine --workpath build\pyinstaller --specpath build\pyinstaller --add-data "%ROOT%\frontend\dist;frontend_dist" --add-data "%ROOT%\backend\app\agent\templates;agent_templates" --add-data "%ROOT%\.claude\skills;skills" --add-data "%ROOT%\backend\app\resources;resources" --add-data "%ROOT%\src-tauri\binaries\ffmpeg-licence.json;." --collect-all fe_core --collect-submodules app --collect-submodules uvicorn --collect-submodules winpty "%ROOT%\backend\formencoder_engine.py" || exit /b 1
if not exist "%ROOT%\src-tauri\binaries" mkdir "%ROOT%\src-tauri\binaries"
copy /y dist-engine\formencoder-engine.exe "%ROOT%\src-tauri\binaries\formencoder-engine-%TRIPLE%.exe" >nul
"%ROOT%\src-tauri\binaries\formencoder-engine-%TRIPLE%.exe" --selfcheck
