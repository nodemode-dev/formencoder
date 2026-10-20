@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "OPEN=0"
for %%A in (%*) do (
  if /i "%%~A"=="--open" ( set "OPEN=1" ) else if /i "%%~A"=="--help" ( goto :usage ) else if /i "%%~A"=="-h" ( goto :usage ) else ( call :usage & exit /b 2 )
)

echo.
echo [formencoder] == checking the tools
where python >nul 2>nul || where py >nul 2>nul || ( echo [formencoder] Python 3.12 or newer is needed: https://www.python.org/downloads/ & exit /b 1 )
where node >nul 2>nul || ( echo [formencoder] Node 20.19 or newer is needed: https://nodejs.org & exit /b 1 )
where cargo >nul 2>nul || ( echo [formencoder] Rust 1.95 or newer is needed: https://rustup.rs & exit /b 1 )
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)" || ( echo [formencoder] Node 20.19 or 22.12 or newer is needed: https://nodejs.org & exit /b 1 )

echo.
echo [formencoder] == installing the engine service, the encoding engine and the interface
echo [formencoder] the first engine build takes a few minutes
call setup\install_all.bat || goto :failed

echo.
echo [formencoder] == installing the desktop packages and checking the Tauri toolchain
call setup\install_desktop.bat || goto :failed

echo.
echo [formencoder] == building the interface, freezing the engine, staging FFmpeg and building the desktop app
echo [formencoder] the first build compiles several hundred Rust crates
call setup\desktop_build.bat || goto :failed

echo.
echo [formencoder] done. The installers are in src-tauri\target\release\bundle (msi and nsis)
if "%OPEN%"=="1" start "" "src-tauri\target\release\bundle"
exit /b 0

:failed
echo.
echo [formencoder] the build stopped at the step above; fix what it says and run build_app.bat again
exit /b 1

:usage
echo build_app.bat           build formencoder's desktop app on Windows, start to finish
echo   --open                open the folder with the installers when the build is done
exit /b 0
