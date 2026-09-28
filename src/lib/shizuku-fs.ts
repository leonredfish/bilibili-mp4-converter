import * as Shizuku from 'react-native-shizuku';

import type { FsAdapter, FsEntryType, FsStat } from './fs-adapter';

/**
 * 以 **shell / root 身份** 读写文件系统（通过 react-native-shizuku 的 UserService）。
 *
 * 这是 Android 11+ 下读取其他 App `/Android/data/` 目录的**唯一**途径 ——
 * 普通 App 即使持有 MANAGE_EXTERNAL_STORAGE 也做不到。
 *
 * 使用前需保证 `Shizuku.getStatus() === 'ready'`；首次调用会自动绑定 UserService。
 */
export const shizukuFs: FsAdapter = {
  name: 'shizuku',

  exists(path: string): Promise<boolean> {
    return Shizuku.exists(path);
  },

  async ls(path: string): Promise<string[]> {
    const entries = await Shizuku.listDir(path);
    return entries.map((entry) => entry.name);
  },

  async stat(path: string): Promise<FsStat> {
    const entry = await Shizuku.stat(path);
    if (!entry) {
      throw new Error(`Not found: ${path}`);
    }
    const type: FsEntryType =
      entry.type === 'directory' ? 'directory' : entry.type === 'file' ? 'file' : 'other';
    return { type };
  },

  readText(path: string): Promise<string> {
    return Shizuku.readTextFile(path);
  },
};
