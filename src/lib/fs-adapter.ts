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
