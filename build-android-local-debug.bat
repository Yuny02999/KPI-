@echo off
setlocal
cd /d "%~dp0"
set EXPO_NO_GIT_STATUS=1
set GRADLE_USER_HOME=C:\Users\qinyunji\Documents\Codex\.gradle-codex
set GRADLE_OPTS=-Dorg.gradle.vfs.watch=false
if exist "%CD%\.jdk17\jdk-17.0.18+8\bin\java.exe" (
  set JAVA_HOME=%CD%\.jdk17\jdk-17.0.18+8
  set PATH=%CD%\.jdk17\jdk-17.0.18+8\bin;%PATH%
)
if exist "%CD%\.android-sdk" (
  set ANDROID_HOME=%CD%\.android-sdk
)

echo.
echo === Autodrive Metrics Recorder - Local Android Debug APK ===
echo.
echo Full log will be saved to local-build.log
echo.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js LTS, then open a new terminal.
  pause
  exit /b 1
)

where java >nul 2>nul
if errorlevel 1 (
  echo Java was not found. Install Microsoft OpenJDK 21 first:
  echo winget install Microsoft.OpenJDK.21
  pause
  exit /b 1
)

where javac >nul 2>nul
if errorlevel 1 (
  echo javac was not found. Please install a full JDK, not only a JRE:
  echo winget install Microsoft.OpenJDK.21
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing project dependencies...
  npm.cmd install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Generating Android native project...
echo === Generating Android native project... === > local-build.log
call .\node_modules\.bin\expo.cmd prebuild --platform android --no-install >> local-build.log 2>&1
if errorlevel 1 (
  echo Expo prebuild failed. See local-build.log.
  pause
  exit /b 1
)

echo.
echo Building debug APK locally...
cd android
call gradlew.bat --no-daemon assembleDebug >> ..\local-build.log 2>&1
if errorlevel 1 (
  echo Gradle build failed. See local-build.log.
  pause
  exit /b 1
)
cd ..

echo.
echo APK created:
echo %CD%\android\app\build\outputs\apk\debug\app-debug.apk
echo.
pause
