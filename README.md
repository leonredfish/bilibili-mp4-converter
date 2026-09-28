# Bilibili MP4 Converter

一个 Android 工具 App：把 B 站客户端缓存的 `video.m4s` + `audio.m4s` 无损合并成可播放的 `.mp4`。

> 这是对旧项目 [leonredfish/BilibiliMp4](https://github.com/leonredfish/BilibiliMp4) 的重写，只保留「m4s → mp4」这一核心功能，基于现代 Expo + React Native 技术栈重建。

## 技术栈

| 类别 | 选择 |
|------|------|
| 框架 | Expo SDK 57（React Native 0.86 / New Architecture） |
| 语言 | TypeScript |
| 路由 | expo-router |
| 转码引擎 | `@mtd1410/react-native-ffmpegkit`（FFmpegKit 社区重建版，FFmpeg 7.1，LGPL） |
| 目录选择 | `@react-native-documents/picker`（SAF） |
| 文件系统 | `react-native-blob-util` |
| 状态管理 / 主题 | Zustand |

## 工作原理

B 站缓存的每个视频是「分离的 DASH 分片」：

- `video.m4s` — 纯视频轨（H.264/HEVC）
- `audio.m4s` — 纯音频轨（AAC）

合并只需**流拷贝（remux）**，无需重编码，所以用 FFmpeg 的 `-c copy`：

```
ffmpeg -i video.m4s -i audio.m4s -c copy 输出.mp4
```

App 流程：选择缓存目录 → 扫描 `entry.json` 识别视频（含分 P）→ 一键合并 → 输出到 `Movies/`。

## 构建（Android）

> 转码是本地文件操作，依赖原生模块，**无法用 Expo Go**，需 dev build。Web 端不支持。

前置：安装 Android Studio + JDK 17 + Android SDK 36。

```bash
npm install

# 1. 生成 android/ 原生工程并自动链接原生模块
npx expo prebuild -p android

# 2. 编译并安装到设备/模拟器
npx expo run:android
```

首次运行后，需要在系统设置里授予 **「所有文件访问权限」**（`MANAGE_EXTERNAL_STORAGE`），才能读取 B 站客户端的缓存目录（通常在 `/storage/emulated/0/Android/data/tv.danmaku.bili/download/`）。

## 目录结构

```
src/
  app/             # expo-router 页面（_layout 根布局、index 主界面）
  lib/             # 核心逻辑（bilibili.ts：解码 URI、扫描、合并）
  components/      # 通用 UI（ThemedText/View 等）
  stores/          # Zustand（主题）
  hooks/           # 自定义 hooks
  constants/       # 主题色、间距等
```

## 说明

- FFmpegKit 官方已于 2025 年退役，本项目使用社区重建版 `@mtd1410/react-native-ffmpegkit`（New Architecture / TurboModule，LGPL v3）。
- 默认使用 `https` 变体（对 `-c copy` 足够）。如需完整编解码能力，可在 `expo prebuild` 后的 `android/build.gradle` 里设置 `ext { ffmpegKitPackage = "full" }`。
- 输出目录当前固定为 `/storage/emulated/0/Movies/`，后续可改为可配置。
