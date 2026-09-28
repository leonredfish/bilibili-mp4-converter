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

前置：**JDK 17**（必须是 17，不要用 18/21）+ Android SDK 36（需含 `platforms;android-36` 与 `build-tools;36.0.0`）。Android Studio 可选。

```bash
npm install

# 1. 生成 android/ 原生工程并自动链接原生模块
npx expo prebuild -p android

# 2. 编译并安装到设备/模拟器
npx expo run:android
```

`npm install` 会自动跑 `postinstall`（即 `scripts/patch-gradle-mirrors.js`），它做三件事：

1. 把 Gradle 发行版下载地址换成镜像，并把 wrapper 的 `networkTimeout` 提到 10 分钟（默认只有 10 秒，130MB 在国内必然超时）；
2. 给主工程**和两个 included build**（RN / expo 的 Gradle 插件）的仓库列表加上国内 Maven 镜像——它们是独立构建，读不到主工程配置，必须单独打；
3. 探测本机 JDK 17 并写入 `org.gradle.java.home`，避免 Gradle 经 `foojay-resolver` 去 `api.foojay.io` 自动下载工具链（国内不可达，会静默卡住数分钟）。

> `android/` 由 `expo prebuild` 生成且已被 gitignore，**每次 prebuild 后都要重跑一次补丁**：
>
> ```bash
> npx expo prebuild -p android && npm run patch:gradle
> ```

脚本可用环境变量覆盖（见脚本头部注释）：`GRADLE_DIST_MIRROR`、`MAVEN_MIRRORS`、`JAVA17_HOME`、`SKIP_GRADLE_PATCH=1`。国内网络建议直接把 `JAVA_HOME` 指向 JDK 17，一劳永逸。

首次运行后，需要在系统设置里授予 **「所有文件访问权限」**（`MANAGE_EXTERNAL_STORAGE`）。
注意入口是 **设置 → 应用 → 特殊应用权限（部分机型叫「权限管理」/「其他权限」）→ 所有文件访问权限**，
而**不是** App 自己的「权限」页——那一页是空的（本 App 只用特殊权限，不占用普通运行时权限）。

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

## 已知限制

**Android 11+ 读不到 B 站缓存目录。** 出于隐私保护，Android 11 起 App 无法访问其他 App 在外部存储的私有目录，**即使已授予「所有文件访问权限」也一样**（Android 13 进一步封死了用原始文件路径绕过的口子）：

> Write access to all internal storage directories **except `/Android/data/`** … Apps that are granted this permission still can't access the app-specific directories that belong to other apps.
> —— [Manage all files on a storage device](https://developer.android.com/training/data-storage/manage-all-files)

而 B 站缓存固定在 `/storage/emulated/0/Android/data/tv.danmaku.bili/download/`，且 B 站不允许自定义缓存路径。

因此在 Android 11 及以上，「扫描 B 站缓存目录」无法直接工作。可行路径：先用 **Shizuku / adb / 支持 Shizuku 的文件管理器**把缓存导出到公共目录（如 `/sdcard/Download/bili/`），再用本 App 的「手动选择目录」处理。彻底解决需要给 App 接入 Shizuku。

## 说明

- FFmpegKit 官方已于 2025 年退役，本项目使用社区重建版 `@mtd1410/react-native-ffmpegkit`（New Architecture / TurboModule，LGPL v3）。
- 默认使用 `https` 变体（对 `-c copy` 足够）。如需完整编解码能力，可在 `expo prebuild` 后的 `android/build.gradle` 里设置 `ext { ffmpegKitPackage = "full" }`。
- 输出目录当前固定为 `/storage/emulated/0/Movies/`，后续可改为可配置。
