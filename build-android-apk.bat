@echo off
setlocal
cd /d "%~dp0"
set EAS_NO_VCS=1

echo.
echo === Autodrive Metrics Recorder - Android APK Build ===
echo.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js LTS, then open a new terminal.
  pause
  exit /b 1
)

where eas >nul 2>nul
if errorlevel 1 (
  echo Installing EAS CLI...
  npm.cmd install --global eas-cli
  if errorlevel 1 (
    echo Failed to install EAS CLI.
    pause
    exit /b 1
  )
)

echo.
echo Checking Expo login...
eas whoami >nul 2>nul
if errorlevel 1 (
  echo Please log in to your Expo account.
  eas login
  if errorlevel 1 (
    echo Expo login failed.
    pause
    exit /b 1
  )
)

echo.
echo Configuring EAS project. If asked to create a project, choose yes.
eas build:configure
if errorlevel 1 (
  echo EAS configuration failed.
  pause
  exit /b 1
)

echo.
echo Starting Android APK cloud build. A download link will appear when it finishes.
eas build --platform android --profile preview

echo.
pause
