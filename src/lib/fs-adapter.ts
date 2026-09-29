import { Platform } from 'react-native';

/**
 * 本机 Android API level（非 Android 平台为 0）。
 * `Platform.Version` 在 Android 上就是 API level 数字（如 Android 15 → 35）。
 */
export const ANDROID_API_LEVEL = Platform.OS === 'android' ? Number(Platform.Version) : 0;

/**
 * 是否需要 shell / root 身份才能读「其他 App 的 /Android/data/」。
 *
 * Android 11（API 30）起，普通 App 读不到别的 App 的 `/Android/data/<pkg>/`，
 * **即便持有 `MANAGE_EXTERNAL_STORAGE` 也不行**（13+ 更彻底）；只有 shell(uid 2000)
 * / root 能读 —— 也就是必须走 Shizuku。
 *
 * 因此读 B 站默认缓存（`/Android/data/tv.danmaku.bili/download`）：
 * - API ≤ 29（Android ≤ 10）：App 自身权限 + `READ_EXTERNAL_STORAGE` 即可（blobFs）
 * - API ≥ 30（Android 11+）：只有 `shizukuFs` 能读
 *
 * ⚠️ Android 10（API 29）这条边界**未在真机实测过**（开发机上只有 Android 15）。
 * 这里按 API 30 划线：若某台 Android 10 实际读不到，会让用户改用 Shizuku，
 * 不会给出错误的结果。
 */
export const NEEDS_SHELL_FOR_APP_DATA = ANDROID_API_LEVEL >= 30;

/**
 * 最小文件系统抽象。
 *
 * 引入它的唯一目的：让「扫描 B 站缓存」的逻辑与「用谁的权限去读」解耦。
 *
 * - `blobFs`      → react-native-blob-util，以 **App 自身** 权限读（手动选目录时用）
 * - `shizukuFs`   → react-native-shizuku，以 **shell/root** 身份读
 *                   （Android 11+ 只有它能读其他 App 的 /Android/data/）
 *
 * 方法签名刻意与 `ReactNativeBlobUtil.fs` 对齐，便于互换。
 */
export type FsEntryType = 'file' | 'directory' | 'other';

export type FsStat = {
  type: FsEntryType;
};

export interface FsAdapter {
  /** 适配器名字，用于错误信息与日志 */
  readonly name: string;

  exists(path: string): Promise<boolean>;

  /** 返回目录内的条目名（不含路径）。非目录/不可读时应 reject */
  ls(path: string): Promise<string[]>;

  /** 取条目信息；不存在时应 reject */
  stat(path: string): Promise<FsStat>;

  /** 读取文本文件（UTF-8） */
  readText(path: string): Promise<string>;
}
