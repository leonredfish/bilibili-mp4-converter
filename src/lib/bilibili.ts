import { FFmpegKit, ReturnCode } from '@mtd1410/react-native-ffmpegkit';
import { errorCodes, isErrorWithCode, pickDirectory as pickDirectoryNative } from '@react-native-documents/picker';
import ReactNativeBlobUtil from 'react-native-blob-util';
import sanitize from 'sanitize-filename';

import { blobFs } from './blob-fs';
import type { FsAdapter } from './fs-adapter';
import type { Materializer } from './materializer';

/** B 站缓存的 entry.json 结构（只用到的字段） */
type BilibiliEntry = {
  title: string;
  type_tag: string;
  page_data: {
    page: number;
    part?: string;
  };
};

/** 扫描后得到的单个待合并视频 */
export type VideoItem = {
  directory: string;
  title: string;
  part?: string;
  page: number;
  videoPath: string;
  audioPath: string;
};

/** 默认输出目录（Android 公共 Movies 目录） */
export const DEFAULT_OUTPUT_DIR = '/storage/emulated/0/Movies';

/** B 站客户端缓存的默认目录（Android） */
export const DEFAULT_BILIBILI_CACHE_DIR =
  '/storage/emulated/0/Android/data/tv.danmaku.bili/download';

const SAF_TREE_PREFIX = 'content://com.android.externalstorage.documents/tree/';

/**
 * Android Storage Access Framework 返回的是 content:// 树形 URI，
 * 这里还原成真实文件路径（与原项目做法一致）。
 */
function decodeDirectoryUri(uri: string): string {
  let url = decodeURIComponent(uri).replace(SAF_TREE_PREFIX, '');
  if (url.startsWith('primary')) {
    url = url.replace(/^primary:/, '/storage/emulated/0/');
  } else {
    const volumeName = url.replace(/:.*/, '');
    url = url.replace(/^.*:/, '');
    url = `/storage/${volumeName}/${url}`;
  }
  return url;
}

/** 弹出系统目录选择器，返回真实路径（取消返回空串） */
export async function pickDirectory(): Promise<string> {
  try {
    const result = await pickDirectoryNative();
    return decodeDirectoryUri(result.uri);
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return '';
    }
    throw e;
  }
}

async function readEntry(dir: string, fs: FsAdapter): Promise<BilibiliEntry | null> {
  const entryPath = `${dir}/entry.json`;
  if (!(await fs.exists(entryPath))) return null;
  try {
    const json = await fs.readText(entryPath);
    return JSON.parse(json) as BilibiliEntry;
  } catch {
    // entry.json 损坏或非法时跳过该目录
    return null;
  }
}

function toVideoItem(dir: string, entry: BilibiliEntry): VideoItem {
  return {
    directory: dir,
    title: entry.title.replace(/\//g, ' '),
    part: entry.page_data.part ? entry.page_data.part.replace(/\//g, ' ') : undefined,
    page: entry.page_data.page,
    videoPath: `${dir}/${entry.type_tag}/video.m4s`,
    audioPath: `${dir}/${entry.type_tag}/audio.m4s`,
  };
}

async function scanForEntries(dir: string, items: VideoItem[], fs: FsAdapter): Promise<void> {
  const entry = await readEntry(dir, fs);
  if (entry) {
    // 命中一个缓存条目：必须 video.m4s 与 audio.m4s **都在** 才算可合并。
    // 只查 video.m4s 的话，音轨缺失的条目会被列出来，然后在合并阶段才失败；
    // 而那是批次中间的失败——前面已成功的成果会被一并丢掉。
    const [hasVideo, hasAudio] = await Promise.all([
      fs.exists(`${dir}/${entry.type_tag}/video.m4s`),
      fs.exists(`${dir}/${entry.type_tag}/audio.m4s`),
    ]);
    if (hasVideo && hasAudio) {
      items.push(toVideoItem(dir, entry));
    }
    return; // entry.json 所在目录即叶子，不再深入
  }

  let files: string[];
  try {
    files = await fs.ls(dir);
  } catch {
    return; // 无权限或目录不存在
  }

  for (const file of files) {
    const sub = `${dir}/${file}`;
    try {
      const stat = await fs.stat(sub);
      if (stat.type === 'directory') {
        await scanForEntries(sub, items, fs);
      }
    } catch {
      // 忽略无法访问的子项
    }
  }
}

/**
 * 递归扫描目录，找出所有含 entry.json 的 B 站缓存。
 * 兼容 download/<avid>/c_<cid>/entry.json 这类多层嵌套结构。
 *
 * `fs` 决定用「谁的权限」去读：
 * - 默认 `blobFs`：App 自身权限，适用于用户手动选择/导出的公共目录
 * - 传 `shizukuFs`：以 shell/root 身份读，Android 11+ 下读其他 App
 *   的 /Android/data/ 的唯一途径
 */
export async function scanDirectory(
  rootDir: string,
  fs: FsAdapter = blobFs,
): Promise<VideoItem[]> {
  const items: VideoItem[] = [];
  await scanForEntries(rootDir, items, fs);
  return items;
}

async function ensureDir(path: string): Promise<void> {
  if (!(await ReactNativeBlobUtil.fs.exists(path))) {
    await ReactNativeBlobUtil.fs.mkdir(path);
  }
}

/** 通知系统媒体库，否则新写入的 mp4 不会出现在相册/播放器里（尽力而为，失败不影响结果） */
async function notifyMediaStore(path: string): Promise<void> {
  try {
    await ReactNativeBlobUtil.fs.scanFile([{ path, mime: 'video/mp4' }]);
  } catch {
    // 忽略：媒体库通知失败不影响合并结果
  }
}

/**
 * 用 FFmpeg 的流拷贝（-c copy）把 video.m4s + audio.m4s 无损合并为 MP4，
 * 返回输出文件路径。
 *
 * `materializer` 负责把 item 的 m4s 变成 **FFmpegKit（App 进程）可读** 的路径：
 * Shizuku 场景必须先搬到中转目录，公共目录场景是直通。临时文件在成功与失败时
 * 都会被清理（`finally`）。
 */
export async function mergeToMp4(
  item: VideoItem,
  outDir: string,
  materializer: Materializer,
): Promise<string> {
  const media = await materializer.materialize(item);
  try {
    await ensureDir(outDir);
    const fileName = sanitize(`${item.page}_${item.part ?? item.title}`);
    const outPath = `${outDir}/${fileName}.mp4`;

    const session = await FFmpegKit.execute(
      `-i "${media.video}" -i "${media.audio}" -c copy -y -- "${outPath}"`,
    );
    const returnCode = await session.getReturnCode();
    if (!ReturnCode.isSuccess(returnCode)) {
      throw new Error(`FFmpeg 合并失败（code: ${returnCode}）`);
    }
    await notifyMediaStore(outPath);
    return outPath;
  } finally {
    await media.dispose();
  }
}
