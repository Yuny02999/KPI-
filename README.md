# 计数助手

一个面向 Android 的 React Native 计数 App。

## 功能

- 自定义多个计数内容
- 点击主按钮自动 +1
- 撤回最近一次计数
- 当前计数清零
- 本地保存数据
- 导出 HTML 文档报告并通过系统分享面板发送或保存
- 毛玻璃界面效果
- 点击记录时支持轻微震动反馈
- 测试任务信息：任务名、路线、车辆、版本、记录人
- 长按指标卡片可记录严重程度和备注
- 事件时间线明细
- 导出报告包含任务信息、分类统计、严重程度统计和事件明细
- 一键结束当前测试任务，并保存为历史报告
- 可配置云端同步接口，结束任务后自动 POST 完整 JSON 报告
- 数据页查看历史任务、同步状态和云端入口

## 云端同步接口

推荐使用 Supabase。先在 Supabase SQL Editor 运行 [supabase-schema.sql](./supabase-schema.sql)，然后在 App 设置页填写：

- Supabase Project URL
- Supabase anon public key

结束任务时会写入：

- `test_reports`
- `test_events`

如果不用 Supabase，也可以在 App 设置页填写备用接口地址。结束任务时会向该地址发送：

```http
POST /api/reports
Content-Type: application/json
```

请求体包含 `session`、`summary`、`metrics`、`events`。接口可以返回：

```json
{
  "url": "https://your-server.com/reports/report-id"
}
```

返回的 `url` 会显示在数据页，用于打开云端报告。

注意：当前 App 通过 Supabase REST API 依次写入 `test_reports` 和 `test_events`。如果网络在第二步中断，云端可能已保存报告主表但缺少部分事件；App 会在本机数据页标记同步失败并保留完整本地数据，可重试同步。

## Android 构建与测试

安装 Node.js 20.19.4 或更新版本、JDK 17 和 Android Studio。通过 SDK Manager 安装 Android SDK 36、Build Tools 35.0.0 和 36.0.0、NDK 27.1.12297006、CMake 3.22.1 和 Platform Tools。已有项目本地工具时可直接使用。首次构建需要从 npm 和 Maven 下载依赖。

```powershell
. .\use-local-env.ps1
npm.cmd ci
.\build-android-apk.bat
```

测试 APK 位于 `android/app/build/outputs/apk/release/app-release.apk`，内含 JavaScript，可离线启动。Windows 打包脚本会为含中文的项目路径临时映射盘符。使用 Android Studio 调试时，从只含 ASCII 字符的路径打开 `android` 目录，并先运行 `npm.cmd start`。

启用手机的 USB 调试后运行：

```powershell
adb devices
.\build-android-apk.bat -Install
```

测试 APK 使用本地调试密钥。覆盖旧版需要相同签名。如签名不同，先导出所需历史记录，卸载会清除本机应用数据。使用 x86_64 模拟器时，用 `.\build-android-apk.bat -Architecture x86_64 -Install` 构建并安装。如果项目内已有 `apk_counter_test`，加载本地环境后可用 `emulator -avd apk_counter_test` 启动。

在「考点」页测试精确和大致位置权限、拒绝授权、系统定位关闭、首次获取坐标和保存考点。用模拟器移动位置验证经过考点触发和结束测试后停止监听，最后用真机核对 GPS 精度与超时回退。

## 发布版本

Git 上传目标为 [Yuny02999/KPI-](https://github.com/Yuny02999/KPI-)（`https://github.com/Yuny02999/KPI-.git`）。

[Android Release 列表](APK_versions/VERSION_NOTES.md)是版本记录和安装包索引。正式归档前，在 `android/app/build.gradle` 中提高 `versionName` 和 `versionCode`。小范围向后兼容修复通常只增加补丁版本。准备一份 UTF-8 Markdown 说明，按功能、修复、优化或实验写明实际变化，再补充验证情况。只需填写本版涉及的分类。

```powershell
.\build-android-apk.bat -Architecture arm64-v8a,x86_64 -ReleaseNotes .\release-notes.md
```

归档完成后，脚本把带版本号、构建号和架构的 APK 写入 `APK_versions`，并更新列表和 SHA-256。分发时从 Release 列表取包。普通本地打包仍输出到 `android/app/build/outputs/apk/release`，便于临时验证。
