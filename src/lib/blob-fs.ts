import ReactNativeBlobUtil from 'react-native-blob-util';

import type { FsAdapter, FsEntryType, FsStat } from './fs-adapter';

/**
 * 以 App 自身权限读写文件系统（react-native-blob-util）。
 *
 * 注意：Android 11+ 下本适配器**读不到其他 App 的 /Android/data/**，
 * 因此只适用于「用户手动选择/导出的公共目录」。
 */
export const blobFs: FsAdapter = {
  name: 'blob-util',

  exists(path: string): Promise<boolean> {
    return ReactNativeBlobUtil.fs.exists(path);
  },

  ls(path: string): Promise<string[]> {
    return ReactNativeBlobUtil.fs.ls(path);
  },

  async stat(path: string): Promise<FsStat> {
    const info = await ReactNativeBlobUtil.fs.stat(path);
    const type: FsEntryType = info.type === 'directory' ? 'directory' : 'file';
    return { type };
  },

  readText(path: string): Promise<string> {
    return ReactNativeBlobUtil.fs.readFile(path, 'utf8');
  },
};
