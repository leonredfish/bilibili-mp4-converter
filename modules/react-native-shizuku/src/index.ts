/**
 * react-native-shizuku —— Android 平台公开 API。
 *
 * 该文件不依赖任何 Expo 包；iOS / Web 由 `index.ios.ts` / `index.web.ts` 提供 stub。
 *
 * M0 阶段只实现状态查询与授权；文件/命令接口（listDir / runShell / copyTree …）
 * 在 ShizukuFileService（UserService）落地后补齐。
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { ShizukuError, toShizukuError } from './ShizukuError';
import type { ShizukuInfo, ShizukuStatus, StatusSubscription } from './Shizuku.types';

export * from './Shizuku.types';
export { ShizukuError, toShizukuError } from './ShizukuError';
export type { ShizukuErrorCode } from './ShizukuError';
export { SHIZUKU_ERROR_CODES } from './ShizukuError';

const MODULE_NAME = 'Shizuku';

const LINKING_ERROR = [
  `The package 'react-native-shizuku' doesn't seem to be linked. Make sure:`,
  ``,
  `- You rebuilt the app after adding it (npx expo run:android / npx react-native run-android)`,
  `- It is registered for autolinking (react-native.config.js → dependencies[...].root)`,
].join('\n');

/** 原生模块表面（M0 子集） */
type NativeShizukuModule = {
  getStatus(): Promise<ShizukuStatus>;
  requestPermission(): Promise<boolean>;
  getShizukuInfo(): Promise<ShizukuInfo | null>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
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

let emitter: NativeEventEmitter | null = null;

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

/**
 * 查询当前 Shizuku 状态。不会抛错：任何异常都归为 'unsupported'。
 */
export async function getStatus(): Promise<ShizukuStatus> {
  if (Platform.OS !== 'android') return 'unsupported';
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
  if (Platform.OS !== 'android') return null;
  try {
    return await getNative().getShizukuInfo();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 授权
 * ------------------------------------------------------------------ */

/**
 * 申请 Shizuku 授权。会弹出系统对话框。
 *
 * - 已授权 → 直接 resolve(true)
 * - 用户拒绝且勾选「不再询问」→ resolve(false)
 * - 服务未运行 / 平台不支持 → reject(ShizukuError)
 */
export async function requestPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new ShizukuError('UNSUPPORTED', 'Shizuku is only available on Android.');
  }
  try {
    return await getNative().requestPermission();
  } catch (error) {
    throw toShizukuError(error);
  }
}

/* ------------------------------------------------------------------ *
 * 事件
 * ------------------------------------------------------------------ */

/**
 * 订阅状态变化（binder 到达 / 死亡、授权变化）。
 *
 * 返回的 `remove()` 用于取消订阅。
 */
export function addStatusListener(
  listener: (status: ShizukuStatus) => void,
): StatusSubscription {
  if (Platform.OS !== 'android') return { remove() {} };

  if (!emitter) emitter = new NativeEventEmitter(getNative() as never);

  const subscription = emitter.addListener('onStatusChanged', (status: unknown) => {
    listener(status as ShizukuStatus);
  });

  return { remove: () => subscription.remove() };
}
