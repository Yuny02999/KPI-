param(
  [ValidateSet("arm64-v8a", "x86_64", "arm64-v8a,x86_64")]
  [string]$Architecture = "arm64-v8a",
  [switch]$Install,
  [string]$ReleaseNotes
)

$ErrorActionPreference = "Stop"
$buildRoot = $PSScriptRoot
$drive = $null
$gradleArgs = @("--console=plain", "assembleRelease", "-PreactNativeArchitectures=$Architecture")

if ($ReleaseNotes) {
  $notes = (Get-Content -LiteralPath $ReleaseNotes -Raw -Encoding UTF8).Trim()
  if (!$notes -or $notes -match '(?m)^## v') { throw "Provide release changes without a version heading." }
  $gradle = Get-Content -LiteralPath (Join-Path $PSScriptRoot "android/app/build.gradle") -Raw
  $version = [regex]::Match($gradle, 'versionName\s+"(\d+\.\d+\.\d+)"').Groups[1].Value
  $code = [regex]::Match($gradle, 'versionCode\s+(\d+)').Groups[1].Value
  if (!$version -or !$code) { throw "Cannot read Android version." }
  $releaseDir = Join-Path $PSScriptRoot "APK_versions"
  $releaseList = Join-Path $releaseDir "VERSION_NOTES.md"
  $list = Get-Content -LiteralPath $releaseList -Raw -Encoding UTF8
  $headings = [regex]::Matches($list, '(?m)^## v(\d+\.\d+\.\d+) / code ([^\r\n]+)\r?$')
  foreach ($entry in $headings) {
    if ($entry.Groups[2].Value -notmatch '^\d+$') { throw "Verify the unresolved Android versionCode in the release list first." }
    if ([int]$code -le [int]$entry.Groups[2].Value -or [version]$version -le [version]$entry.Groups[1].Value) {
      throw "Increase both versionName and versionCode before archiving another release."
    }
  }
  $apkName = "v$version-code$code-$($Architecture.Replace(',', '+'))-release.apk"
  $archive = Join-Path $releaseDir $apkName
  if (Test-Path -LiteralPath $archive) { throw "This release APK already exists." }
}


# Android's Windows build tools require an ASCII project path.
if ($buildRoot -cmatch '[^\x00-\x7F]') {
  $availableDrive = 90..68 | ForEach-Object { "$([char]$_):" } |
    Where-Object { -not (Test-Path "$_\") } | Select-Object -First 1
  if (-not $availableDrive) { throw "No temporary drive letter is available." }
  subst.exe $availableDrive $buildRoot
  if ($LASTEXITCODE -ne 0) { throw "Could not map the project to a temporary drive." }
  $drive = $availableDrive
  $buildRoot = "$drive\"
  $gradleArgs += "--no-daemon"
}

try {
  . (Join-Path $buildRoot "use-local-env.ps1")
  if ($drive) { $env:APK_COUNTER_JS_ROOT = $PSScriptRoot }
  $env:NODE_ENV = "production"
  Push-Location (Join-Path $buildRoot "android")
  try {
    $autolinkingPath = "build\generated\autolinking\autolinking.json"
    if (Test-Path $autolinkingPath) {
      $autolinking = Get-Content -Raw -LiteralPath $autolinkingPath | ConvertFrom-Json
      if ($autolinking.project.android.sourceDir -ne (Get-Location).Path) {
        Remove-Item -LiteralPath $autolinkingPath
      }
    }

    .\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw "APK build failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }

  $apk = (Get-Item -LiteralPath (Join-Path $PSScriptRoot "android\app\build\outputs\apk\release\app-release.apk")).FullName
  Write-Output $apk
  if ($ReleaseNotes) {
    $sha = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash
    $entry = @"
## v$version / code $code

$notes
- APK ($Architecture): [$apkName]($apkName)
- SHA-256: $sha

"@
    $first = if ($headings.Count) { $headings[0].Index } else { $list.Length }
    [IO.File]::Copy($apk, $archive)
    [IO.File]::WriteAllText($releaseList, $list.Insert($first, $entry + [Environment]::NewLine))
    Write-Output $archive
  }
  if ($Install) {
    adb install -r $apk
    if ($LASTEXITCODE -ne 0) { throw "ADB could not install the APK." }
    adb shell am start -W -n "com.autodrive.metricsrecorder/.MainActivity"
    if ($LASTEXITCODE -ne 0) { throw "ADB could not start the app." }
  }
} finally {
  if ($drive) {
    Remove-Item Env:APK_COUNTER_JS_ROOT -ErrorAction SilentlyContinue
    subst.exe $drive /d
  }
}
