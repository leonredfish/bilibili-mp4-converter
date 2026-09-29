import sanitize from 'sanitize-filename';
import * as Shizuku from 'react-native-shizuku';

import type { VideoItem } from './bilibili';
import type { MaterializedMedia, Materializer } from './materializer';

/**
 * 为某个 item 生成稳定的临时子目录名。
 *
 * 取缓存目录路径的最后两段（`<avid>/c_<cid>`）：既稳定、可读，便于出问题时
 * 用 `adb shell ls` 直接核对，也天然避免了同批次内重名。
 */
function tempSubdirName(item: VideoItem): string {
  const tail = item.directory.split('/').filter(Boolean).slice(-2).join('_');
  return sanitize(tail) || 'item';
}

/**
 * 通过 Shizuku（shell 身份）把 m4s 复制到中转目录，得到 FFmpegKit 可读的路径。
 *
 * @param tempDir 中转目录。必须是「**shell 可写 且 App 可读**」的位置 ——
 *                即 App 的外部私有目录，见 `Shizuku.getExternalCacheDir()`。
 *                （App 内部私有目录 `/data/data/<pkg>/` shell 写不进去。）
 */
export function createShizukuMaterializer(tempDir: string): Materializer {
  return {
    name: 'shizuku',

    async materialize(item: VideoItem): Promise<MaterializedMedia> {
      const dir = `${tempDir}/m3-${tempSubdirName(item)}`;
      const video = `${dir}/video.m4s`;
      const audio = `${dir}/audio.m4s`;

      // 清理失败不应影响调用方：临时目录本身由系统兜底回收
      const dispose = async (): Promise<void> => {
        try {
          await Shizuku.remove(dir, { recursive: true });
        } catch {
          // 清理失败不影响调用方
        }
      };

      try {
        // copyFile 会自动创建父目录
        await Shizuku.copyFile(item.videoPath, video);
        await Shizuku.copyFile(item.audioPath, audio);
      } catch (e) {
        await dispose(); // 复制到一半失败也要清干净，不留半份
        throw e;
      }

      return { video, audio, dispose };
    },
  };
}
