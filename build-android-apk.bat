@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-android-apk.ps1" %*
exit /b %errorlevel%
