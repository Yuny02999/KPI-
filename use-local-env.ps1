$tools = Join-Path $PSScriptRoot ".devtools"
$node = Join-Path $tools "node\node.exe"
$jdk = Join-Path $tools "jdk17"
$sdk = Join-Path $tools "android-sdk"
$avd = Join-Path $tools "avd"

if (Test-Path $node) {
  $env:NODE_BINARY = $node
  $env:Path = "$(Split-Path $node);$env:Path"
}
if (Test-Path (Join-Path $jdk "bin\java.exe")) {
  $env:JAVA_HOME = $jdk
}
if (Test-Path $sdk) {
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
}
if (Test-Path $avd) {
  $env:ANDROID_AVD_HOME = $avd
}
if ($env:ANDROID_HOME) {
  $env:Path = "$(Join-Path $env:ANDROID_HOME 'platform-tools');$(Join-Path $env:ANDROID_HOME 'emulator');$env:Path"
}
$env:npm_config_cache = Join-Path $PSScriptRoot ".npm-cache"
$env:GRADLE_USER_HOME = Join-Path $PSScriptRoot ".gradle-home"
