# Bilibili MP4 Converter

一个 Android 工具 App：把 B 站客户端缓存的 `video.m4s` + `audio.m4s` 无损合并成可播放的 `.mp4`。

> 这是对旧项目 [leonredfish/BilibiliMp4](https://github.com/leonredfish/BilibiliMp4) 的重写，只保留「m4s → mp4」这一核心功能，基于现代 Expo + React Native 技术栈重建。

## 技术栈

| 类别 | 选择 |
| --- | --- |
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

```bash
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

首次运行后，需要在系统设置里**手动**授予 **「所有文件访问权限」**（`MANAGE_EXTERNAL_STORAGE`）。
它是**特殊权限**：没有运行时弹窗，也不在 App 自己的「权限」页里。各 ROM 入口不同
（App 内会按本机厂商只显示对应的一条）：

| ROM | 手动开启路径 |
| --- | --- |
| 小米 / 红米 / POCO | 设置 → 隐私保护 → 特殊权限设置 → 所有文件访问权限 |
| 华为 / 荣耀 | 设置 → 应用和服务 → 应用管理 → 本 App → 权限 → 媒体和文件 → 所有文件 |
| **OPPO / 一加 / realme** | **设置 → 隐私 → 权限管理器 → 文件 → 查看更多可以访问所有文件的应用**（在列表里找到本 App） |
| 三星 | 设置 → 应用程序 → 本 App → 权限 → 文件和媒体 → 允许管理所有文件 |
| 原生 / 其它 | 设置 → 应用 → 特殊应用权限 → 所有文件访问权限 |

> ✅ **OPPO / 一加 / realme 这一行是在真机（OnePlus / ColorOS）实测过的**；
> 其余几行来自各厂商官方文档或社区指南，**未逐台实测**（入口位置常随 ROM 版本变化），
> 仅作参考——路径不符时请在设置里搜索「所有文件」。

## 目录结构

```text
src/
  app/             # expo-router 页面（_layout 根布局、index 主界面）
  lib/             # 核心逻辑（bilibili.ts：解码 URI、扫描、合并）
  components/      # 通用 UI（ThemedText/View 等）
  stores/          # Zustand（主题）
  hooks/           # 自定义 hooks
  constants/       # 主题色、间距等
```

## Android 版本支持

读 B 站缓存（`/storage/emulated/0/Android/data/tv.danmaku.bili/download/`）的方式随系统版本不同，
App 因此保留两条扫描路径（UI 上是两个按钮，每个按钮下方都标了**本机是否适用**）：

| Android | API | 可读方式 | 用哪个按钮 | 前置条件 |
| --- | --- | --- | --- | --- |
| 7.0 – 9.0 | 24–28 | App 自身权限直读（scoped storage 之前） | 扫描 B 站缓存目录 | 运行时 `READ_EXTERNAL_STORAGE`（App 会自动申请） |
| 10 | 29 | 同上（**未在真机验证**） | 扫描 B 站缓存目录 | 同上 |
| **11 及以上** | **30+** | **只有 shell / root 能读** | **Shizuku 扫描 B 站缓存** | Shizuku 已安装并激活 |

关于 Android 11+：出于隐私保护，App 无法访问其他 App 在外部存储的私有目录，
**即使已授予「所有文件访问权限」也一样**（Android 13 进一步封死了用原始文件路径绕过的口子）：

> Write access to all internal storage directories **except `/Android/data/`** … Apps that are granted this permission still can't access the app-specific directories that belong to other apps.
> —— [Manage all files on a storage device](https://developer.android.com/training/data-storage/manage-all-files)

因此 11+ 只能以 shell(uid 2000) 身份读取 —— 即依赖 [Shizuku](https://shizuku.rikka.app/)。

> ⚠️ **Android 10（API 29）这条边界未实测**（开发机上只有 Android 15）。代码按 API 30 划线：
> 若某台 Android 10 实际读不到，界面会提示改用 Shizuku，不会给出错误结果。

### 为什么 FFmpeg 还需要「先把文件搬出来」

`FFmpegKit` 跑在 **App 进程内（App 的 UID）**，所以即便 Shizuku 已就绪，FFmpeg 也读不到
`/Android/data/` 下由 shell 扫出来的 m4s。因此合并前必须先用 shell 身份把 `video.m4s` +
`audio.m4s` 复制到「**shell 可写、App 可读**」的中转目录（App 的外部私有缓存目录
`/storage/emulated/0/Android/data/<pkg>/cache`），再交给 FFmpeg。
这就是 `src/lib/materializer.ts` 这个抽象存在的原因（另一个实现 `passthrough` 用于源本就 App 可读的场景）。

## 其它限制 / 待办

- **输出目录**当前固定为 `/storage/emulated/0/Movies/`：Android 11+ 用**直接路径**写公共目录需要
  「所有文件访问权限」（部分 ROM 如 ColorOS 在设置里点不开该开关）；Android ≤9 需要
  `WRITE_EXTERNAL_STORAGE`。计划改为可配置（含用 SAF 选输出目录）。
- 「**手动选择目录**」适用于缓存已导出到公共目录（如 `Download/`）的场景，任何版本都可用、不依赖特殊权限。
- 本地库 `modules/react-native-shizuku` 尚未发布到 npm，暂以 `file:modules/react-native-shizuku` 在仓库内引用。

## 说明

- FFmpegKit 官方已于 2025 年退役，本项目使用社区重建版 `@mtd1410/react-native-ffmpegkit`（New Architecture / TurboModule，LGPL v3）。
- 默认使用 `https` 变体（对 `-c copy` 足够）。如需完整编解码能力，可在 `expo prebuild` 后的 `android/build.gradle` 里设置 `ext { ffmpegKitPackage = "full" }`。
