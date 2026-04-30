$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:EAS_NO_VCS = "1"

Write-Host ""
Write-Host "=== Autodrive Metrics Recorder - Android APK Build ==="
Write-Host ""

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "npm.cmd was not found. Please install Node.js LTS, then open a new PowerShell window."
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Get-Command eas -ErrorAction SilentlyContinue)) {
  Write-Host "Installing EAS CLI..."
  npm.cmd install --global eas-cli
}

Write-Host ""
Write-Host "Checking Expo login..."
try {
  eas whoami | Out-Null
} catch {
  Write-Host "Please log in to your Expo account."
  eas login
}

Write-Host ""
Write-Host "Configuring EAS project. If asked to create a project, choose yes."
eas build:configure

Write-Host ""
Write-Host "Starting Android APK cloud build. A download link will appear when it finishes."
eas build --platform android --profile preview

Write-Host ""
Read-Host "Press Enter to exit"
