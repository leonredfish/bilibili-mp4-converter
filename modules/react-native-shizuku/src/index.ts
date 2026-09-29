/**
 * react-native-shizuku —— Android 平台公开 API。
 *
 * 该文件不依赖任何 Expo 包；iOS / Web 由 `index.ios.ts` / `index.web.ts` 提供 stub。
 *
 * 分层：
 *   - M0：状态 / 授权 / binder 事件
 *   - M1：UserService（以 shell/root 身份运行）→ 文件与命令操作
 *
 * 文件/命令类的接口会自动确保 UserService 已绑定，调用方无需手动 ensureService()。
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { ShizukuError, toShizukuError } from './ShizukuError';
import type {
  CopyResult,
  DirEntry,
  ShellOptions,
  ShellResult,
  ShizukuInfo,
  ShizukuStatus,
  StatusSubscription,
} from './Shizuku.types';

export * from './Shizuku.types';
export { ShizukuError, toShizukuError } from './ShizukuError';
export type { ShizukuErrorCode } from './ShizukuError';
export { SHIZUKU_ERROR_CODES } from './ShizukuError';

const MODULE_NAME = 'Shizuku';

const LINKING_ERROR = [
  `The package 'react-native-shizuku' doesn't seem to be linked. Make sure:`,
  ``,
  `- You rebuilt the app after adding it (npx expo run:android / npx react-native run-android)`,
  `- It is a dependency in package.json (file:/workspace links also work)`,
].join('\n');

/** 原生模块表面 */
type NativeShizukuModule = {
  // M0
  getStatus(): Promise<ShizukuStatus>;
  requestPermission(): Promise<boolean>;
  getShizukuInfo(): Promise<ShizukuInfo | null>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  // M1
  ensureService(): Promise<boolean>;
  exec(
    program: string,
    args: string[] | null,
    cwd: string | null,
    timeoutMs: number,
  ): Promise<ShellResult>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<DirEntry | null>;
  listDir(path: string): Promise<DirEntry[]>;
  readTextFile(path: string): Promise<string>;
  copyFile(src: string, dst: string): Promise<number>;
  remove(path: string, recursive: boolean): Promise<boolean>;
  // M3
  getExternalCacheDir(): Promise<string>;
};

let cachedNative: NativeShizukuModule | null = null;

function getNative(): NativeShizukuModule {
  if (cachedNative) return cachedNative;

  const mod = (NativeModules as Record<string, unknown>)[MODULE_NAME] as
    | NativeShizukuModule
    | undefined;

  if (!mod) throw new ShizukuError('UNSUPPORTED', LINKING_ERROR);

  cachedNative = mod;
  return mod;
}

const isAndroid = () => Platform.OS === 'android';

/* ------------------------------------------------------------------ *
 * M0：状态
 * ------------------------------------------------------------------ */

/**
 * 查询当前 Shizuku 状态。不会抛错：任何异常都归为 'unsupported'。
 */
export async function getStatus(): Promise<ShizukuStatus> {
  if (!isAndroid()) return 'unsupported';
  try {
    return await getNative().getStatus();
  } catch {
    return 'unsupported';
  }
}

/** 是否已就绪（等价于 getStatus() === 'ready'） */
export async function isReady(): Promise<boolean> {
  return (await getStatus()) === 'ready';
}

/** Shizuku 服务端版本信息；不可用时返回 null */
export async function getShizukuInfo(): Promise<ShizukuInfo | null> {
  if (!isAndroid()) return null;
  try {
    return await getNative().getShizukuInfo();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * M0：授权
 * ------------------------------------------------------------------ */

/**
 * 申请 Shizuku 授权。会弹出系统对话框。
 *
 * - 已授权 → 直接 resolve(true)
 * - 用户拒绝且勾选「不再询问」→ resolve(false)
 * - 服务未运行 / 平台不支持 → reject(ShizukuError)
 */
export async function requestPermission(): Promise<boolean> {
  if (!isAndroid()) {
    throw new ShizukuError('UNSUPPORTED', 'Shizuku is only available on Android.');
  }
  try {
    return await getNative().requestPermission();
  } catch (error) {
    throw toShizukuError(error);
  }
}

/* ------------------------------------------------------------------ *
 * M0：事件
 * ------------------------------------------------------------------ */

let emitter: NativeEventEmitter | null = null;

/**
 * 订阅状态变化（binder 到达 / 死亡、授权变化、UserService 连接）。
 */
export function addStatusListener(
  listener: (status: ShizukuStatus) => void,
): StatusSubscription {
  if (!isAndroid()) return { remove() {} };

  if (!emitter) emitter = new NativeEventEmitter(getNative() as never);

  const subscription = emitter.addListener('onStatusChanged', (status: unknown) => {
    listener(status as ShizukuStatus);
  });

  return { remove: () => subscription.remove() };
}

/* ------------------------------------------------------------------ *
 * M1：UserService
 * ------------------------------------------------------------------ */

let servicePromise: Promise<void> | null = null;

/**
 * 绑定 Shizuku UserService（幂等）。一般不需要手动调用 ——
 * 文件/命令类接口会自动确保已绑定。
 */
export function ensureService(): Promise<void> {
  if (!isAndroid()) {
    return Promise.reject(
      new ShizukuError('UNSUPPORTED', 'Shizuku is only available on Android.'),
    );
  }

  if (!servicePromise) {
    servicePromise = getNative()
      .ensureService()
      .then(() => undefined)
      .catch((error: unknown) => {
        servicePromise = null; // 允许下次重试
        throw toShizukuError(error);
      });
  }
  return servicePromise;
}

/** 丢掉已缓存的绑定状态，下次调用会重新绑定（binder 掉线后可用） */
export function resetService(): void {
  servicePromise = null;
}

async function withService<T>(run: (native: NativeShizukuModule) => Promise<T>): Promise<T> {
  await ensureService();
  try {
    return await run(getNative());
  } catch (error) {
    const normalized = toShizukuError(error);
    // 服务掉线时清掉缓存，让下一次调用能重新绑定
    if (
      normalized.code === 'USER_SERVICE_NOT_BOUND' ||
      normalized.code === 'SERVICE_NOT_RUNNING'
    ) {
      servicePromise = null;
    }
    throw normalized;
  }
}

/* ------------------------------------------------------------------ *
 * M1：命令
 * ------------------------------------------------------------------ */

/**
 * 不经 shell 直接执行程序（推荐，规避引号/转义问题）。
 *
 * 注意：`exec('id')` 是你验证 UserService 确实以 shell 身份运行的最快方式。
 */
export async function exec(
  program: string,
  args?: string[],
  options?: ShellOptions,
): Promise<ShellResult> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  return withService((native) =>
    native.exec(program, args ?? null, options?.cwd ?? null, timeoutMs),
  );
}

/* ------------------------------------------------------------------ *
 * M1：文件
 * ------------------------------------------------------------------ */

/** 路径是否存在 */
export async function exists(path: string): Promise<boolean> {
  return withService((native) => native.exists(path));
}

/** 取路径信息；不存在时 resolve(null) */
export async function stat(path: string): Promise<DirEntry | null> {
  return withService((native) => native.stat(path));
}

/**
 * 列出目录内容。
 *
 * 不是目录或不可读时 reject(ShizukuError('IO_ERROR')) —— 注意这与 blob-util 的
 * `ls()` 语义一致，便于在 FsAdapter 里互换。
 */
export async function listDir(path: string): Promise<DirEntry[]> {
  return withService((native) => native.listDir(path));
}

/** 读取文本文件（UTF-8，上限 8MB） */
export async function readTextFile(path: string): Promise<string> {
  return withService((native) => native.readTextFile(path));
}

/**
 * 复制单个文件到指定路径（自动创建父目录）。
 * 返回复制的字节数。
 */
export async function copyFile(src: string, dst: string): Promise<number> {
  return withService((native) => native.copyFile(src, dst));
}

/** 删除文件或目录 */
export async function remove(
  path: string,
  options?: { recursive?: boolean },
): Promise<boolean> {
  return withService((native) => native.remove(path, options?.recursive ?? false));
}

/**
 * 便捷包装：复制目录树（客户端递归，避免在 UserService 里再写一套遍历）。
 *
 * 目前按需实现于 JS 层；`nameFilter` 为正则字符串，匹配文件名。
 */
export async function copyTree(
  src: string,
  dst: string,
  options?: { nameFilter?: string },
): Promise<CopyResult> {
  const filter = options?.nameFilter ? new RegExp(options.nameFilter) : null;
  const result: CopyResult = { files: 0, bytes: 0 };

  const walk = async (from: string, to: string): Promise<void> => {
    const entry = await stat(from);
    if (!entry) throw new ShizukuError('IO_ERROR', `Not found: ${from}`);

    if (entry.type === 'directory') {
      const children = await listDir(from);
      for (const child of children) {
        await walk(child.path, `${to}/${child.name}`);
      }
      return;
    }

    if (filter && !filter.test(entry.name)) return;

    const bytes = await copyFile(from, to);
    result.files += 1;
    result.bytes += bytes;
  };

  await walk(src, dst);
  return result;
}

/* ------------------------------------------------------------------ *
 * M3：中转目录
 * ------------------------------------------------------------------ */

/**
 * App 的「外部私有缓存目录」绝对路径，形如
 * `/storage/emulated/0/Android/data/<pkg>/cache`。
 *
 * **Shizuku（shell）可写、App 自己可读** —— 因此可作为
 * 「把 /Android/data 下的 m4s 搬到 FFmpeg 能读的位置」的中转目录。
 *
 * 不涉及提权，因此不需要 UserService、也不要求 Shizuku 就绪。
 */
export async function getExternalCacheDir(): Promise<string> {
  if (!isAndroid()) {
    throw new ShizukuError('UNSUPPORTED', 'Shizuku is only available on Android.');
  }
  try {
    return await getNative().getExternalCacheDir();
  } catch (error) {
    throw toShizukuError(error);
  }
}
