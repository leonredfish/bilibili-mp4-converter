# 交接提示词 —— Bilibili MP4 Converter（从 M5 继续）

> 用法：在工作电脑上 `git pull`，然后把本文全文作为提示词交给 pi。
> 本文是**自包含**的：假设你（接手的 agent）对本项目一无所知。

---

## 0. 你的任务

接管一个进行中的 Android 项目，**从 M5 继续做**。项目已推到 GitHub，工作区干净。
先读完本文，再动手。

**M0–M4 与两轮 UI 重构都已完成**，功能主链路已在真机跑通：
Shizuku 扫描 → 搬运 → FFmpeg 合并 → 产出可播放 mp4 → 媒体库可见。
所以 M5 不再是「让它能跑」，而是「让它可长期维护」（工程化 + 库收尾）。
**不要重做已完成的里程碑。**

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
（这正是 M3 做掉的事：`lib/materializer.ts` + `lib/shizuku-materializer.ts`。）

---

## 3. 目录结构

```text
src/
  app/
    _layout.tsx               根布局（主题 + Stack）
    index.tsx                 唯一页面：**本体是 FlatList**（条目虚拟化），其余区块走 ListHeader/Footer
  components/
    shizuku-panel.tsx         Shizuku 状态机按钮 + 状态/本机适用性
    source-actions.tsx        权限 + 两个扫描 + 手动选择（各带备注）
    output-dir-picker.tsx     输出目录 + 预设 chip
    video-row.tsx             条目行（FlatList 的 renderItem）
    merge-panel.tsx           MergeProgressPanel / MergeActionBar / MergeResultPanel
    action-button.tsx         统一按钮变体（primary/secondary/permission/merge）
    themed-text.tsx 等        主题化基础组件
  hooks/
    use-converter.ts          页面状态 + **全部编排逻辑**（handler 集中在此）
    use-theme.ts / use-color-scheme*.ts / use-resolved-color-scheme.ts
  constants/
    theme.ts                  颜色 / 间距
    all-files-access.ts       各 ROM 的「所有文件访问权限」入口表 + resolver
  stores/theme-store.ts       Zustand（主题）
  lib/
    bilibili.ts               扫描 + 合并主逻辑（扫描接受 FsAdapter）
    fs-adapter.ts             FS 抽象 + Android 版本判定
    blob-fs.ts                App 自身权限（react-native-blob-util）
    shizuku-fs.ts             shell 身份（react-native-shizuku）
    materializer.ts           「把 m4s 变成 FFmpeg 可读路径」策略 + 直通实现
    shizuku-materializer.ts   用 Shizuku 把 m4s 搬到中转目录
    bilibili.web.ts           Web 降级
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
| **M3** | materialize：库加 `getExternalCacheDir()`；`mergeToMp4` 先搬运再 FFmpeg；`finally` 清理 + `scanFile` 通知媒体库。真机产出 **31 个 mp4（5.9G）** | `dcb5e31` |
| 扫描分流 | 扫描入口按 Android 版本分流（≤ 10 用 app 权限 + 运行时存储权限；11+ 只能走 Shizuku）+ 各按钮「本机适用性」备注 | `ca16d3f` |
| **M4** | 正式 UI：M0 诊断面板下线、批次进度/取消、失败项重试、输出目录可配置、「已存在则跳过」（不再 `-y` 盲目覆盖；B4 起改为可切换） | `6bfd7f2` |
| **A4** | 拆 `app/index.tsx`：668 → 115 行（hook + 5 组件 + 常量表） | `ba27b25` |
| **A5** | 条目列表虚拟化：页面本体改 `FlatList`，其余区块走 ListHeader / ListFooter | `266f729` |
| **B4** | 输出已存在策略三选一（跳过 / 覆盖 / 重命名）+ 抽出 `ChipRow`；修掉 `mergeToMp4` 参数被同名 `const` 遮蔽的坑 | `05bd8cb` |
| handoff 自身 | 补 dev-client 连不上 Metro 的坑 + 自检法 | `3a0d96d` |

### 真机已验证的事实（可作为你的前提）

> ⚠️ **计数会变**（缓存会被增删，别把它当常量）：下面是**当时**的记录；
> 截至最后一次验证，当前源目录是 **19 个** entry.json / 19 video.m4s / 19 audio.m4s。
> 拿不准时先 `adb shell find … -name entry.json | wc -l` 取地面真相。

- `Shizuku.getStatus()` → `ready`；`not-running` 与 binder 死亡/恢复**双向事件**均生效
- `exec("id")` → **`uid=2000(shell)`**
- `listDir(缓存目录)` / `scanDirectory(缓存目录, shizukuFs)` → 与 adb 地面真相**逐次一致**
  （曾 31 项，现 19 项；均核对过）
- `readTextFile` 能正确读出 entry.json 的中文标题
- **`copyFile` 能写入 App 私有外部目录** → M3 的基础，已实测
- **M3 端到端**：全量合并 → `/storage/emulated/0/Movies/` 产出 31 个 mp4（合计 5.9G）；
  文件头合法（`ftyp isom … mp41`）；**中转目录合并后自动清空**；MediaStore 可查到（相册可见）
- **M4 的「已存在则跳过」**：再点合并 → 「成功 0 · 跳过 19 · 失败 0」，Movies 数量不变（未覆盖任何文件）
- **B4 三种输出策略**（源目录临时只留 1 条 ~450MB 来跑，避免 19 条全量；测完已还原）：
  跳过 → 「成功 0 · 跳过 1」且文件系统**无写入**；覆盖 → 「成功 1」+ 默认文件 mtime 更新、不产生新文件；
  重命名 → 先生成 `…！ (2).mp4`，再跑一次生成 `…！ (3).mp4`（**logcat 里 FFmpeg 实际写入的路径与 UI 显示一致**）；
  三者产物都是 449,561,710 字节的合法 MP4。
- **A5 虚拟化后**：header / 条目卡片 / footer（合并按钮、结果面板）均正常；合并流程可用

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
| 块内 `const` 遮蔽同名参数 | `mergeToMp4` 里既声明了参数 `outPath`、又在函数体内写了 `const outPath = outputPathFor(...)`，参数被静默遮蔽 → `resolveOutputPath()` 算好的重命名路径被丢弃。**tsc / eslint / expo lint 全绿**，只有真机才暴露。关键参数别给默认值、直接改必填，让漏传变成编译错误 |
| `adb shell input swipe` 会误触按钮 | 滑动起点若压在按钮上，会触发该按钮的 press（实测在合并按钮上误触发了多次合并，造成「幽灵写入」并误导排查方向）。滚长列表时把起点放到 `x=1000` 之类空白处 |
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

## 7. 你的主要任务：M5（工程化 + 库收尾）

主链路已跑通，M5 的目标是「让它可长期维护」。按价值排序：

#### A. 工程化

- 清理 **8 个 0 引用**的模板依赖（已 grep 核对：`src/` 与 `modules/` 里均无引用）：
  `@expo/ui`、`expo-glass-effect`、`expo-symbols`、`expo-web-browser`、`expo-device`、
  `expo-constants`、`expo-font`、`expo-system-ui`。
  ⚠️ 顺带发现 `expo-linking` / `expo-status-bar` 也是 0 引用 —— 删之前逐个
  `grep -rn "<pkg>" src/ modules/ app.json` 复核，**删完必须真机重启验证一次**。
- 抽掉硬编码 `APP_PACKAGE`（现在硬编码在 `hooks/use-converter.ts`，仅用于
  「授予所有文件访问权限」的 intent data）。
- **纯函数单测**：`decodeDirectoryUri`、`scanForEntries`（注入假 FsAdapter）、`outputPathFor`。
  仓库现在**没有任何测试，也没有 CI**。
- 扫描性能：一次全量 ≈**220 次串行 Binder IPC**（每条目约 11 次）。若体感慢，
  在 AIDL 加**批量接口**（新增方法要追加事务码 + 递增 `USER_SERVICE_VERSION`，见 §6）。
- Android 10 边界：README 已如实标注「未实测」，有 Android 10 真机时补测。

#### B. 库自身（`modules/react-native-shizuku`）

- 补未验证分支：`not-installed` / `no-permission` / `requestPermission` 弹窗
- 事件回调里顺带刷新 `shizukuInfo`（现在只在初次挂载与授权后拉）
- （可选）真 TurboModule spec + codegen（当前是 legacy module + interop）
- **迁出为独立仓库**（用户既定计划：先仓库内跑通，现已跑通 —— 见 §10）

---

## 8. 风险（需持续关注）

- Android 16 / 新版 Play 系统更新可能让 **Shizuku 也读不到 `/Android/data`**
  （上游 issue #1574 / #1807）——这会让整个方案失效，需监控
- Google Play 政策：`MANAGE_EXTERNAL_STORAGE` 上架需专门申报（侧载安装无碍）
- **输出目录**写公共目录（`/storage/emulated/0/Movies` 等）在 Android 11+ 需要
  「所有文件访问权限」，而部分 ROM（如 ColorOS）该开关入口很深。若换 ROM / 要上架，
  这里要么改用 SAF 选输出目录，要么写到 App 自己可写的目录
- 空间：提取中转会临时多占「单条视频体积」（单条 1080P ≈450MB）

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
| **dev-client 红屏**（堆栈含 `loadJSBundleFromAssets` / `JSBundleLoader.kt`） | App 没走 Metro，退回了 APK 内置 bundle（debug 包没有）。**USB + `adb reverse` 最稳**，见下方代码块。⚠️ **设备断开重连后 `adb reverse` 会丢，必须重设** |
| 想确认「红屏到底是代码问题还是连接问题」 | 让 Metro 真编一次 Android bundle：**200 就说明代码没问题**，红屏纯属连接。⚠️ 入口必须是 `expo-router/entry`，写成 `./index` 会 404（`UnableToResolveError`），别被它误导 |

```bash
# dev-client 连不上 Metro（红屏 loadJSBundleFromAssets）时的标准修法
adb reverse tcp:8081 tcp:8081
adb shell am force-stop com.leonredfish.bilibilimp4
adb shell am start -a android.intent.action.VIEW \
  -d "bilibilimp4://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"

# 自检：Metro 能否打包（200 = 能，说明红屏纯属连接问题）
curl -o /dev/null -w '%{http_code}\n' \
  'http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true'
```

### 环境限制

- `ctx_execute_file` 的沙箱根被限死在 Pi-Harness 目录，**读不到本项目文件** → 项目文件读写请用 `read` / `edit`
- `ctx_batch_execute` 在本机走 PowerShell，**不要用 `&&`**（会解析失败）

---

## 10. 需要用户拍板的点

1. ~~M3 的临时目录~~ → **已定**：App 外部私有目录（已实测 shell 可写 / App 可读）。
2. ~~工作电脑能否连真机~~ → **已解决**：USB + `adb reverse`（见 §9；
   **设备重连后要重设**）。
3. **独立仓库时机**：功能已跑通，建议 M5 的「库自身」部分做完后就抽。
4. **`APP_PACKAGE` 怎么抽**：读 `Application.applicationId`（需加 `expo-application` 依赖）
   还是从 `app.json` 经 `expo-constants` 读（但 `expo-constants` 正在待清理名单里）？
