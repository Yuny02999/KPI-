$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$gradleFile = Join-Path $PSScriptRoot "android\app\build.gradle"
$appJsonFile = Join-Path $PSScriptRoot "app.json"
$summaryDir = Join-Path $PSScriptRoot "APK_versions"

if (-not (Test-Path $gradleFile)) {
  throw "Cannot find $gradleFile"
}

$gradle = Get-Content -LiteralPath $gradleFile -Raw -Encoding UTF8
$codeMatch = [regex]::Match($gradle, "versionCode\s+(\d+)")
$nameMatch = [regex]::Match($gradle, 'versionName\s+"(\d+)\.(\d+)\.(\d+)"')

if (-not $codeMatch.Success -or -not $nameMatch.Success) {
  throw "Could not read versionCode/versionName from android\app\build.gradle"
}

$nextCode = [int]$codeMatch.Groups[1].Value + 1
$major = [int]$nameMatch.Groups[1].Value
$minor = [int]$nameMatch.Groups[2].Value
$patch = [int]$nameMatch.Groups[3].Value + 1
$nextName = "$major.$minor.$patch"

$gradle = [regex]::Replace($gradle, "versionCode\s+\d+", "versionCode $nextCode", 1)
$gradle = [regex]::Replace($gradle, 'versionName\s+"\d+\.\d+\.\d+"', "versionName `"$nextName`"", 1)
[System.IO.File]::WriteAllText($gradleFile, $gradle, [System.Text.UTF8Encoding]::new($false))

$appJson = Get-Content -LiteralPath $appJsonFile -Raw -Encoding UTF8 | ConvertFrom-Json
$appJson.expo.version = $nextName
$appJsonText = $appJson | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($appJsonFile, $appJsonText, [System.Text.UTF8Encoding]::new($false))

$localJdk = Join-Path $PSScriptRoot ".jdk17\jdk-17.0.18+8"
$localSdk = Join-Path $PSScriptRoot ".android-sdk"
if (Test-Path $localJdk) {
  $env:JAVA_HOME = $localJdk
  $env:PATH = "$localJdk\bin;$env:PATH"
}
if (Test-Path $localSdk) {
  $env:ANDROID_HOME = $localSdk
}
$env:GRADLE_USER_HOME = "C:\Users\qinyunji\.gradle-codex"
$env:GRADLE_OPTS = "-Dorg.gradle.vfs.watch=false"
$env:NODE_ENV = "production"

Push-Location ".\android"
try {
  .\gradlew.bat --no-daemon --console=plain assembleRelease -PreactNativeArchitectures=arm64-v8a
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle release build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$apkSource = Join-Path $PSScriptRoot "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkSource)) {
  throw "Release APK was not found at $apkSource"
}

New-Item -ItemType Directory -Force -Path $summaryDir | Out-Null

$apkTargetName = "v$nextName-code$nextCode-release-autodrive-metrics.apk"
$apkTarget = Join-Path $summaryDir $apkTargetName

Copy-Item -LiteralPath $apkSource -Destination $apkTarget -Force
Copy-Item -LiteralPath $apkSource -Destination (Join-Path $PSScriptRoot "autodrive-metrics-latest-release.apk") -Force

$hash = (Get-FileHash -LiteralPath $apkTarget -Algorithm SHA256).Hash
$note = @"

## v$nextName / code $nextCode

- File: $apkTargetName
- Type: Release APK, supports overwrite install
- Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
- SHA256: $hash
"@

Add-Content -LiteralPath (Join-Path $summaryDir "VERSION_NOTES.md") -Value $note -Encoding UTF8

Write-Host ""
Write-Host "Versioned release APK created:"
Write-Host $apkTarget
Write-Host "SHA256: $hash"
