$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$env:EXPO_NO_GIT_STATUS = "1"
$localJdk = Join-Path $PSScriptRoot ".jdk17\jdk-17.0.18+8"
$localSdk = Join-Path $PSScriptRoot ".android-sdk"
if (Test-Path $localJdk) {
  $env:JAVA_HOME = $localJdk
  $env:PATH = "$localJdk\bin;$env:PATH"
}
if (Test-Path $localSdk) {
  $env:ANDROID_HOME = $localSdk
}
$env:GRADLE_USER_HOME = "C:\Users\qinyunji\Documents\Codex\.gradle-codex"
$env:GRADLE_OPTS = "-Dorg.gradle.vfs.watch=false"
$logPath = Join-Path $PSScriptRoot "local-build.log"
"" | Set-Content -Encoding UTF8 $logPath

function Run-Step {
  param(
    [string]$Title,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host $Title
  Add-Content -Encoding UTF8 $logPath ""
  Add-Content -Encoding UTF8 $logPath "=== $Title ==="

  & $Command 2>&1 | Tee-Object -FilePath $logPath -Append

  if ($LASTEXITCODE -ne 0) {
    throw "$Title failed with exit code $LASTEXITCODE"
  }
}

Write-Host ""
Write-Host "=== Autodrive Metrics Recorder - Local Android Debug APK ==="
Write-Host ""

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "npm.cmd was not found. Please install Node.js LTS, then open a new PowerShell window."
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
  Write-Host "Java was not found. Install Microsoft OpenJDK 21 first:"
  Write-Host "winget install Microsoft.OpenJDK.21"
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Get-Command javac -ErrorAction SilentlyContinue)) {
  Write-Host "javac was not found. Please install a full JDK, not only a JRE:"
  Write-Host "winget install Microsoft.OpenJDK.21"
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Test-Path ".\node_modules")) {
  Run-Step "Installing project dependencies..." { npm.cmd install }
}

Run-Step "Installing updated dependencies..." { npm.cmd install }

if (-not (Test-Path ".\node_modules\.bin\expo.cmd")) {
  Write-Host "Expo CLI was not found in node_modules. Running npm install first."
  Run-Step "Installing project dependencies..." { npm.cmd install }
}

Run-Step "Generating Android native project..." {
  .\node_modules\.bin\expo.cmd prebuild --platform android --no-install
}

Run-Step "Building debug APK locally..." {
  Push-Location ".\android"
  try {
    .\gradlew.bat --no-daemon assembleDebug
  } finally {
    Pop-Location
  }
}

$apkPath = Join-Path $PSScriptRoot "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
  Write-Host ""
  Write-Host "APK created:"
  Write-Host $apkPath
} else {
  Write-Host ""
  Write-Host "Build finished, but APK was not found at the expected path."
}

Write-Host ""
Write-Host "Build log:"
Write-Host $logPath
Read-Host "Press Enter to exit"
