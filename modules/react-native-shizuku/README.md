# react-native-shizuku

[Shizuku](https://shizuku.rikka.app/) 的 React Native 绑定（**仅 Android**）。

让 JS 代码以 **shell (uid 2000) 或 root (uid 0)** 身份执行命令与文件操作 —— 这是普通 App
即便持有 `MANAGE_EXTERNAL_STORAGE` 也做不到的事（Android 11+ 禁止访问其他 App 的
`/Android/data/<pkg>/`）。

不依赖 `expo-modules-core`，可用于任何 RN 项目（含 Expo 的 prebuild/CNG 项目）。

> 状态：M1。状态/授权/事件 + 文件/命令已可用；尚未发布到 npm，当前通过
> `"react-native-shizuku": "file:modules/react-native-shizuku"` 在仓库内引用。

## 前置条件

1. 用户设备需安装 **Shizuku**（或 Sui / root）。未安装时 `getStatus()` 返回 `'not-installed'`。
2. 用户需启动 Shizuku 服务（无线调试 / 连接电脑 adb / root）。
3. 首次使用需授权本 App —— 调用 `requestPermission()` 弹系统对话框。

## 用法

```ts
import * as Shizuku from 'react-native-shizuku';

const status = await Shizuku.getStatus();
// 'unsupported' | 'not-installed' | 'not-running' | 'no-permission' | 'ready'

if (status === 'ready') {
  // 文件/命令类接口会自动确保 UserService 已绑定
  const { stdout } = await Shizuku.exec('id');
  // stdout: uid=2000(shell) gid=2000(shell) …

  const entries = await Shizuku.listDir('/sdcard/Android/data/tv.danmaku.bili/download');
  const raw = await Shizuku.readTextFile(`${entries[0].path}/entry.json`);
  await Shizuku.copyFile(entries[0].path, '/sdcard/Download/out');
}
```

### 状态与授权

| API | 说明 |
|-----|------|
| `getStatus(): Promise<ShizukuStatus>` | 查询状态；**不抛错**，异常一律归为 `'unsupported'` |
| `isReady(): Promise<boolean>` | `getStatus() === 'ready'` 的简写 |
| `requestPermission(): Promise<boolean>` | 弹系统授权框；「拒绝且不再询问」时 resolve `false` |
| `getShizukuInfo(): Promise<ShizukuInfo \| null>` | `{ versionName, apiVersion, userServiceReady }` |
| `addStatusListener(cb): { remove() }` | 订阅状态变化（binder 到达/死亡、授权变化） |

状态判定顺序（不可颠倒）：平台 → 是否安装 → binder 存活 → 版本 → 是否授权。

### 命令

| API | 说明 |
|-----|------|
| `exec(program, args?, { cwd?, timeoutMs? })` | **不经 shell** 直接执行程序，规避引号/转义问题。返回 `{ code, stdout, stderr }`；无法启动时 `code = -1`，超时被杀 `code = -2` |

### 文件

| API | 说明 |
|-----|------|
| `exists(path)` | 路径是否存在 |
| `stat(path)` | `DirEntry \| null` |
| `listDir(path)` | `DirEntry[]`；非目录或不可读时 reject `IO_ERROR` |
| `readTextFile(path)` | UTF-8 文本（上限 8MB） |
| `copyFile(src, dst)` | 复制单文件，自动建父目录；返回字节数 |
| `copyTree(src, dst, { nameFilter? })` | 客户端递归复制，`nameFilter` 为正则字符串 |
| `remove(path, { recursive? })` | 删除文件或目录 |

### 服务管理

| API | 说明 |
|-----|------|
| `ensureService()` | 显式绑定 UserService（幂等）。文件/命令类接口会自动调用 |
| `resetService()` | 丢弃缓存的绑定状态，下次调用重新绑定（binder 掉线后可用） |

### 错误

失败一律以 `ShizukuError` 抛出，带机器可读的 `code`（**请按 code 分支，不要解析 message**）：

```
UNSUPPORTED · SERVICE_NOT_RUNNING · PERMISSION_DENIED
USER_SERVICE_NOT_BOUND · COMMAND_FAILED · IO_ERROR · TIMEOUT
```

## 工作原理

`exec` 与文件操作**不在 App 进程里执行**，而是通过 Shizuku 的 **UserService** 机制，
在一个由 Shizuku server 以 shell/root 身份拉起的独立进程中执行（`ShizukuFileService`）。
App 通过 AIDL 与之通信，因此：

- 绕过了 Android 的 scoped storage 限制（可读写其他 App 的 `/Android/data/`）
- `exec` 是真正的进程派生，不是模拟

实现细节（都在 `android/` 下，改动前请读）：

- `ShizukuFileService` 必须继承 AIDL 生成的 `Stub`、**必须有公开无参构造函数**、
  类上必须标 `@Keep`（否则 R8 改名后 Shizuku 反射找不到）。
- `destroy()` 必须用 Shizuku 保留的事务码 `16777114`，并在末尾 `System.exit()` ——
  因为 `unbindUserService` **不会**杀进程。
- AIDL 要求「要么每个方法都写事务码，要么都不写」。**这些编号是跨进程 ABI，
  一旦发布不能改动/复用**；新增方法请追加新编号并递增 `USER_SERVICE_VERSION`，
  Shizuku 会据此重启旧服务。
- 服务类**不需要**在 AndroidManifest 里声明，Shizuku 会自行拉起。
- `UserServiceArgs` 的 ComponentName 必须用 `context.getPackageName()`，
  **不能用 `BuildConfig.APPLICATION_ID`**（在库里那是库自身的 namespace）。

## 平台支持

| 平台 | 行为 |
|------|------|
| Android | 完整实现 |
| iOS | 纯 JS stub（`src/index.ios.ts`）：`getStatus()` 返回 `'unsupported'`，其余抛 `UNSUPPORTED` |
| Web | 同 iOS（`src/index.web.ts`） |

因为 Shizuku 是 Android 专有方案，本库**不提供任何 iOS 原生代码**，也不产生 iOS 构建负担。

## 许可

Apache-2.0。Shizuku 及 Shizuku-API 归 [RikkaApps](https://github.com/RikkaApps/Shizuku-API) 所有（Apache-2.0）。
