# 交接提示词 —— Bilibili MP4 Converter（从 M3 继续）

> 用法：在工作电脑上 `git pull`，然后把本文全文作为提示词交给 pi。
> 本文是**自包含**的：假设你（接手的 agent）对本项目一无所知。

---

## 0. 你的任务

接管一个进行中的 Android 项目，**从 M3 继续做**。项目已推到 GitHub，工作区干净。
先读完本文，再动手。**不要重做已完成的里程碑。**

---

## 1. 第一步：把项目拉起来并自检

```bash
git clone https://github.com/leonredfish/bilibili-mp4-converter   # 已clone则 git pull
cd bilibili-mp4-converter
npm install          # 会自动执行 postinstall 补丁（国内网络构建必需，见 §5）
npx tsc --noEmit     # 应通过
```

Android 构建：

```bash
export JAVA_HOME=<你的 JDK 17 路径>          # 必须是 17，不要 18/21
npx expo prebuild -p android && npm run patch:gradle
npx expo run:android
```

> **注意**：`android/` 由 prebuild 生成且被 gitignore。
> **每次 prebuild 之后都要重跑 `npm run patch:gradle`**，否则会卡在下载（见 §5）。

---

## 2. 项目是什么

Android 工具 App：把 B 站客户端缓存的 `video.m4s` + `audio.m4s` **无损 remux**（FFmpeg `-c copy`）成 `.mp4`。

技术栈：Expo SDK 57 / RN 0.86 / New Architecture / TypeScript / expo-router / FFmpegKit（社区重建版）。

### 核心难点（整个项目的存在理由）

B 站缓存固定在 `/storage/emulated/0/Android/data/tv.danmaku.bili/download/`，
而 **Android 11+ 禁止任何 App 读取其他 App 的 `/Android/data/` —— 即使持有 `MANAGE_EXTERNAL_STORAGE` 也不行**
（Google 官方文档 + 真机实测均已确认）。

因此在 M0–M2 接入了 **Shizuku**（用户设备已装 13.6.0）：以 shell(uid 2000) 身份读该目录。

### 决定性架构约束（务必理解）

**FFmpegKit 跑在 App 进程内，是 App 的 UID。**
所以即使 Shizuku 装好授权好，**FFmpeg 依然读不到 `/Android/data/...`**。

→ Shizuku 只能承担「**把文件搬出来**」，合并必须走「先提取 → 再 FFmpeg」。
这正是 M3 要补的步骤。

---

## 3. 目录结构

```
src/
  app/index.tsx              唯一页面（含临时「诊断面板」，M4 要替换成正式 UI）
  lib/
    bilibili.ts              扫描 + 合并主逻辑（扫描接受 FsAdapter）
    fs-adapter.ts            FS 抽象接口（exists/ls/stat/readText）
    blob-fs.ts               App 自身权限实现（react-native-blob-util）
    shizuku-fs.ts            shell/root 身份实现（react-native-shizuku）
    bilibili.web.ts          Web 降级
  components/  constants/  hooks/  stores/
modules/react-native-shizuku/     仓库内本地库（纯 RN，零 expo 依赖）
  src/                            公开 JS API
  android/src/main/aidl/          IShizukuFileService.aidl + 2 个 Parcelable
  android/src/main/java/.../      ShizukuModule / ShizukuPackage / ShizukuFileService(UserService)
  README.md                       库的完整 API 与实现注意事项（**改库前必读**）
scripts/patch-gradle-mirrors.js   国内构建补丁（postinstall）
```

---

## 4. 已完成（**不要重做**）

| 阶段 | 内容 | commit |
|---|---|---|
| 构建环境 | gradle 发行版换腾讯云镜像；JDK 17 工具链；included build 加阿里云镜像；固化为 postinstall 脚本 | `e9a4723` `f7bff26` |
| 权限修复 | 「所有文件访问权限」跳转 action 写错（应 `MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`） | `bcb5326` |
| **M0** | `react-native-shizuku` 骨架：状态机 / 授权 / binder 事件；库自带 manifest 合并 ShizukuProvider | `e3440da` |
| **M1** | AIDL + Parcelable + **UserService**（shell 身份）+ `exec`/文件 API | `1e791da` |
| **M2** | `FsAdapter` 抽象 + `blobFs`/`shizukuFs`，扫描逻辑零改动地支持两种权限来源 | `c7b8652` |
| P1-上游 | 扫描同时校验 `video.m4s` 与 `audio.m4s` | `e0907c8` |
| P1-下游 | 合并逐项容错（不再「一失败全丢」） | `3fe39b4` |

### 真机已验证的事实（可作为你的前提）

- `Shizuku.getStatus()` → `ready`；`not-running` 与 binder 死亡/恢复**双向事件**均生效
- `exec("id")` → **`uid=2000(shell)`**
- `listDir('/sdcard/Android/data/tv.danmaku.bili/download')` → **31 项**（adb 地面真相：31 个 entry.json / 31 个 video.m4s / 31 个 audio.m4s，缓存合计 5.9 GB，单条 1080P ≈450 MB）
- `readTextFile` 能正确读出 entry.json 的中文标题
- **`copyFile` 能写入 App 私有外部目录** → 这是 M3 的基础，已实测
- `scanDirectory(缓存目录, shizukuFs)` → **找到 31 个视频**
- 合并 31 个（源在 /Android/data、FFmpeg 读不到）→ 汇总「成功 0 / 失败 31」，**批次不中断**

---

## 5. 环境坑（每个都踩过，别再踩）

| 坑 | 处理 |
|---|---|
| JDK 必须是 **17** | `android/gradle.properties` 里有 `org.gradle.java.home`；脚本会自动探测 JDK 17（含 `D:/Programs/SDK_Tools`、`D:/Programs`）。JDK 在别处时设 `JAVA17_HOME` |
| gradle 发行版下载超时 | 已改腾讯云镜像 + `networkTimeout` 10min（见 postinstall 脚本） |
| foojay.io 卡死 | RN 插件要求 `jvmToolchain(17)`，找不到本机 JDK 17 就去 `api.foojay.io` 下载（国内不可达）。已通过 `org.gradle.java.home` + `auto-download=false` 解决 |
| 独立构建读不到主工程镜像 | RN / expo 的 Gradle 插件是 **included build**，需单独打镜像（脚本已覆盖） |
| `android/` 是生成的 | 每次 prebuild 后跑 `npm run patch:gradle` |
| 构建产物 | `.gitignore` 已排除 `modules/*/android/build` 等，**别提交构建产物** |
| 阿里云镜像有 Shizuku AAR | `dev.rikka.shizuku:api` / `:provider` 13.1.5 可正常解析 |

---

## 6. Shizuku 库的硬约束（**改库前必读**）

- **AIDL 事务码是跨进程 ABI，发布后不可改动/复用**。
  当前：`destroy = 16777114`（Shizuku 保留），`exec=1, exists=2, stat=3, listDir=4, readTextFile=5, copyFile=6, remove=7`。
  **新增方法必须追加新编号，并递增 `ShizukuModule.USER_SERVICE_VERSION`**，Shizuku 才会重启旧服务。
- AIDL 要求「**要么每个方法都写事务码，要么都不写**」。
- `ShizukuFileService` 必须：继承 AIDL 的 `Stub`、**有公开无参构造**、类上标 `@Keep`（否则 R8 改名后 Shizuku 反射找不到）。
- `destroy()` 里必须 `System.exit(0)` —— `unbindUserService` **不会**杀进程。
- **不要用 `BuildConfig.APPLICATION_ID`**：在库里那是**库自身的 namespace**。用 `context.getPackageName()`（官方 demo 用前者是因为 demo 本身就是 App）。
- UserService **不需要**在 AndroidManifest 里声明，Shizuku 自行拉起。
- AIDL 方法一律用**哨兵值**表达失败（`null`/`-1`/`false`），不抛 `RemoteException`（避免 AIDL 生成代码是否声明 `throws` 的版本差异）。
- 库的 `android/build.gradle` 里 **`buildFeatures { aidl true }` 是必需的**（AGP 8 起默认关闭，否则 AIDL 不编译，报出误导性的「程序包 xxx 不存在」）。
- 不要试图让 FFmpeg 直接读 `/Android/data`，也不要试图把 UserService 做进 App 进程。

---

## 7. 你的主要任务：M3

**目标：第一次产出真实可播放的 mp4。**

1. **拿到临时目录**
   库新增 `getExternalCacheDir()`（或等效 API），返回 App 的**外部私有目录**：
   `/storage/emulated/0/Android/data/com.leonredfish.bilibilimp4/cache/`
   —— 选它的原因：**shell 可写、App 可读**（M1 已实测）；App 内部私有目录（`/data/data/...`）shell 写不进去。
2. **materialize 步骤**
   合并前用 Shizuku `copyFile` 把该视频的 `video.m4s` + `audio.m4s` 搬到临时目录，得到 App 可读路径。
   建议设计：`materialize(item): Promise<{ video: string; audio: string }>`，与 FsAdapter 同样保持「可替换」的边界。
3. **改造 `mergeToMp4`**
   先 materialize，再把可读路径喂给 FFmpegKit。单条中转 ≈450MB，注意耗时与空间。
4. **清理**
   成功**和失败**都要删临时文件（放 `finally`）。
5. **媒体库通知**
   合并成功后调用 `ReactNativeBlobUtil.fs.scanFile()`，否则 mp4 不会出现在相册/播放器里。
6. **真机端到端验证**
   产出可播放 mp4。这也会**自然覆盖 P1-1 尚未直接验证的「成功项被保留」那一半**（当前 0 个成功）。

---

## 8. 之后（M4 与收尾）

**M4 · 正式 UI**
- 三个按钮：`授予「所有文件访问权限」`（原）｜`用 Shizuku 读取 B 站缓存`（新，状态机驱动）｜`手动选择目录`（B 兜底，先导出到公共目录再处理）
- **替换掉 `src/app/index.tsx` 里的临时「M0 诊断」面板**（含 `Shizuku 扫描 B 站缓存` 按钮与残留自检文本）
- 进度 + 取消（长批次）；输出已存在时的策略（现在一律 `-y` 覆盖）；失败项重试入口
- 输出目录可配置（README 点名）

**工程化**
- 清理 **8 个 0 引用**的模板依赖：`@expo/ui`、`expo-glass-effect`、`expo-symbols`、`expo-web-browser`、`expo-device`、`expo-constants`、`expo-font`、`expo-system-ui`
- 抽掉硬编码 `APP_PACKAGE`；纯函数单测（`decodeDirectoryUri`、扫描）+ CI
- 扫描性能：一次全量 ≈**220 次串行 Binder IPC**；若体感慢，在 AIDL 加批量接口

**库自身**
- 补未验证分支：`not-installed` / `no-permission` / `requestPermission` 弹窗
- 事件回调里顺带刷新 `shizukuInfo`
- （可选）真 TurboModule spec + codegen（当前 legacy + interop）
- **迁出为独立仓库**（用户的既定计划：先仓库内跑通，再抽独立 repo）

**风险**
- Android 16 / 新版 Play 系统更新可能让 **Shizuku 也读不到 `/Android/data`**（上游 issue #1574 / #1807）——需监控
- Google Play 政策：`MANAGE_EXTERNAL_STORAGE` 若上架需处理（侧载安装无碍）
- 空间：提取中转会临时多占单视频体积

---

## 9. 工作约定（这个项目一路形成的，请沿用）

- **一个提交一个关注点**，提交信息用中文、说明「为什么」而不只是「做了什么」
- **先取证、再怀疑**：这个项目里我三次误判都是因为没先取地面真相。例：UI 说「找到 3 个视频」，实际是我自己的 `grep` 截断，代码本来是对的。**先 `adb` 取真相，再动代码**
- **不改变既有行为时要明说**：纯重构就保持零行为变化，便于回归定位
- **未验证的部分要如实标注**，不要用「应该没问题」糊过去
- 每次改动都尽量**真机验证**，并把验证证据写进提交信息

### 真机验证方法论（重要）

| 手段 | 说明 |
|---|---|
| **`adb shell uiautomator dump`** | **读 UI 的首选**。截图看不到（模型不支持图片），logcat 也不行 |
| `console.log` | RN 0.86 里**走 DevTools，不进 logcat** —— 别指望它 |
| Git Bash 里的 `/sdcard` 路径 | 必须 `export MSYS_NO_PATHCONV=1`，否则被转成 `C:/Program Files/Git/sdcard/...` |
| Windows 上的 Python | `subprocess` 要显式 `encoding='utf-8'`，否则 GBK 解码报错 |
| 滚动 | uiautomator 只 dump **可见**节点，按钮在下方时要先 `input swipe` 滚下去 |
| 审查 `adb logcat` | 输出极吵，用 `-s <TAG>` 精确过滤，别用宽 grep |
| 恢复 Shizuku（13.6+） | `adb shell /data/app/~~.../moe.shizuku.privileged.api-.../lib/arm64/libshizuku.so`（**不再是 start.sh**）。也可在 Shizuku App 里点「启动」 |

### 环境限制

- `ctx_execute_file` 的沙箱根被限死在 Pi-Harness 目录，**读不到本项目文件** → 项目文件读写请用 `read` / `edit`
- `ctx_batch_execute` 在本机走 PowerShell，**不要用 `&&`**（会解析失败）

---

## 10. 需要用户拍板的点

1. **M3 的临时目录**：App 外部私有目录（**推荐**，已实测可写）还是公共目录？
2. **工作电脑能否连真机？** M3 必须真机验证（需要已装并激活 Shizuku 的手机）。
   若不能连，建议先做不依赖真机的部分（M4 的 UI 改造、工程化清理），真机验证留回本地。
3. **独立仓库时机**：建议 M4 之后。
