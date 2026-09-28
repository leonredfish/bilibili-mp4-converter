/**
 * Web 端空实现：浏览器无本地文件访问与 FFmpeg 能力，
 * 仅用于保证 Web 端能正常打包渲染 UI，实际转码只在 Android 上可用。
 */
export type VideoItem = {
  directory: string;
  title: string;
  part?: string;
  page: number;
  videoPath: string;
  audioPath: string;
};

export const DEFAULT_OUTPUT_DIR = '/storage/emulated/0/Movies';

export async function pickDirectory(): Promise<string> {
  return '';
}

export async function scanDirectory(_rootDir: string): Promise<VideoItem[]> {
  return [];
}

export async function mergeToMp4(_item: VideoItem, _outDir: string): Promise<string> {
  return '';
}
