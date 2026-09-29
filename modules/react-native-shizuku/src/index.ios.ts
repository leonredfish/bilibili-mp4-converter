/**
 * iOS stub：Shizuku 是 Android 专有方案，iOS 上全部降级。
 *
 * Metro 会优先解析 `index.ios.ts`，因此 iOS 打包不会碰任何原生代码，
 * 也无需提供 ios/ 目录或 podspec。
 */
import { ShizukuError } from './ShizukuError';
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

const MESSAGE = 'Shizuku is only available on Android.';

export async function getStatus(): Promise<ShizukuStatus> {
  return 'unsupported';
}

export async function isReady(): Promise<boolean> {
  return false;
}

export async function getShizukuInfo(): Promise<ShizukuInfo | null> {
  return null;
}

export async function requestPermission(): Promise<boolean> {
  throw new ShizukuError('UNSUPPORTED', MESSAGE);
}

export function addStatusListener(_listener: (status: ShizukuStatus) => void): StatusSubscription {
  return { remove() {} };
}

export function ensureService(): Promise<void> {
  return Promise.reject(new ShizukuError('UNSUPPORTED', MESSAGE));
}

export function resetService(): void {
  // no-op
}

export async function exec(
  _program: string,
  _args?: string[],
  _options?: ShellOptions,
): Promise<ShellResult> {
  throw new ShizukuError('UNSUPPORTED', MESSAGE);
}

export async function exists(_path: string): Promise<boolean> {
  return false;
}

export async function stat(_path: string): Promise<DirEntry | null> {
  return null;
}

export async function listDir(_path: string): Promise<DirEntry[]> {
  throw new ShizukuError('UNSUPPORTED', MESSAGE);
}

export async function readTextFile(_path: string): Promise<string> {
  throw new ShizukuError('UNSUPPORTED', MESSAGE);
}

export async function copyFile(_src: string, _dst: string): Promise<number> {
  throw new ShizukuError('UNSUPPORTED', MESSAGE);
}

export async function remove(
  _path: string,
  _options?: { recursive?: boolean },
): Promise<boolean> {
  return false;
}

export async function copyTree(
  _src: string,
  _dst: string,
  _options?: { nameFilter?: string },
): Promise<CopyResult> {
  throw new ShizukuError('UNSUPPORTED', MESSAGE);
}

export async function getExternalCacheDir(): Promise<string> {
  throw new ShizukuError('UNSUPPORTED', MESSAGE);
}
