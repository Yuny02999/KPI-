# 计数助手

一个适用于 iOS 和 Android 的 Expo/React Native 计数 App。

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

## 运行

先安装依赖：

```bash
npm install
```

Expo SDK 54 需要 Node.js 20.19.x 或更高版本。Windows PowerShell 如果拦截 `npm.ps1`，可以改用 `npm.cmd install` 和 `npm.cmd start`。

启动开发服务：

```bash
npm start
```

然后可以用 Expo Go 扫码预览，或运行：

```bash
npm run android
npm run ios
```

`npm run ios` 需要 macOS 和 Xcode 环境。

## 打包

Windows 上可以直接运行：

```bash
build-android-apk.bat
```

它会安装/调用 EAS CLI，登录 Expo 后生成 Android APK 下载链接。

如果 EAS 上传失败，也可以本地生成调试 APK：

```bash
build-android-local-debug.bat
```

输出文件在 `android/app/build/outputs/apk/debug/app-debug.apk`。

也可以手动使用 EAS Build：

```bash
npx eas build --platform android --profile preview
npx eas build --platform ios --profile production
```

Android 的 `preview` 配置会生成可直接安装的 APK。`production` 配置会生成用于应用商店的 AAB。
iOS 打包需要 Apple Developer 账号。
