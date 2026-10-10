@echo off
setlocal
cd /d "%~dp0.."
echo [formencoder] installing the engine service
pushd backend
call oc_install.bat || ( popd & exit /b 1 )
popd
echo [formencoder] building the encoding engine (the first build takes a few minutes)
call setup\build_native.bat %1 || ( echo [formencoder] the encoding engine did not build, run formencoder.bat doctor & exit /b 1 )
echo [formencoder] installing the interface
pushd frontend
call oc_install.bat || ( popd & exit /b 1 )
popd
if not exist backend\.env copy backend\.env.example backend\.env >nul
echo [formencoder] done. Boot with formencoder.bat
