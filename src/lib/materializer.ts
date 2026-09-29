import type { VideoItem } from './bilibili';

/**
 * 一次 materialize 的结果：FFmpegKit 可读的 m4s 路径 + 清理句柄。
 */
export type MaterializedMedia = {
  /** App（FFmpegKit）可读的 video.m4s 路径 */
  video: string;
  /** App（FFmpegKit）可读的 audio.m4s 路径 */
  audio: string;
  /** 删除本次 materialize 产生的临时文件；幂等，可重复调用 */
  dispose(): Promise<void>;
};

/**
 * 「把扫描到的 item 变成 FFmpeg 可读路径」的策略。
 *
 * 存在的唯一原因：**FFmpegKit 跑在 App 进程内（App 的 UID）**，所以即便
 * Shizuku 已就绪，FFmpeg 也读不到 `/Android/data/` 下由 shell 扫描出来的 m4s。
 * 这类源必须先用 shell 身份搬到「shell 可写、App 可读」的中转目录；而「手动选择
 * 公共目录」的源本来就 App 可读，无需搬动。
 *
 * 两条路径因此需要可替换的策略，而不是把搬运逻辑写死在 `mergeToMp4` 里 ——
 * 与 `FsAdapter` 是同一个设计动机。
 */
export interface Materializer {
  /** 适配器名字，用于错误信息与日志 */
  readonly name: string;

  materialize(item: VideoItem): Promise<MaterializedMedia>;
}

/**
 * 直通实现：源文件本来就 App 可读（公共目录 + blobFs），原样返回，不做任何复制。
 */
export const passthroughMaterializer: Materializer = {
  name: 'passthrough',
  async materialize(item: VideoItem): Promise<MaterializedMedia> {
    return {
      video: item.videoPath,
      audio: item.audioPath,
      dispose: async () => {},
    };
  },
};
