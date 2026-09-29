/**
 * Web 端空实现：浏览器无本地文件访问与 FFmpeg 能力，
 * 仅用于保证 Web 端能正常打包渲染 UI，实际转码只在 Android 上可用。
 */
import type { Materializer } from './materializer';

export type VideoItem = {
  directory: string;
  title: string;
  part?: string;
  page: number;
  videoPath: string;
  audioPath: string;
};

export const DEFAULT_OUTPUT_DIR = '/storage/emulated/0/Movies';

export const DEFAULT_BILIBILI_CACHE_DIR =
  '/storage/emulated/0/Android/data/tv.danmaku.bili/download';

export async function pickDirectory(): Promise<string> {
  return '';
}

export async function scanDirectory(_rootDir: string): Promise<VideoItem[]> {
  return [];
}

export async function mergeToMp4(
  _item: VideoItem,
  _outDir: string,
  _materializer: Materializer,
  _outPath: string,
): Promise<string> {
  return '';
}

export function outputPathFor(_item: VideoItem, outDir: string): string {
  return outDir;
}

export type OutputStrategy = 'overwrite' | 'skip' | 'rename';

/** Web 端没有文件系统，一律放行（不会真的写盘） */
export async function resolveOutputPath(
  _item: VideoItem,
  outDir: string,
  _strategy?: OutputStrategy,
): Promise<string | null> {
  return outDir;
}
