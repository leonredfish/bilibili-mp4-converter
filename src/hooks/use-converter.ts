import * as IntentLauncher from 'expo-intent-launcher';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import * as Shizuku from 'react-native-shizuku';
import type { ShizukuInfo, ShizukuStatus } from 'react-native-shizuku';

import {
  DEFAULT_BILIBILI_CACHE_DIR,
  DEFAULT_OUTPUT_DIR,
  mergeToMp4,
  outputExists,
  outputPathFor,
  pickDirectory,
  scanDirectory,
  type VideoItem,
} from '@/lib/bilibili';
import { ANDROID_API_LEVEL, NEEDS_SHELL_FOR_APP_DATA } from '@/lib/fs-adapter';
import { passthroughMaterializer, type Materializer } from '@/lib/materializer';
import { createShizukuMaterializer } from '@/lib/shizuku-materializer';
import { shizukuFs } from '@/lib/shizuku-fs';

const APP_PACKAGE = 'com.leonredfish.bilibilimp4';
const WEB_MESSAGE = '目录选择与转码仅支持 Android，请在真机或模拟器上运行';

/** 批次进度（供进度面板显示） */
export type MergeProgress = {
  /** 已完成项数（当前正在做第 done + 1 项） */
  done: number;
  total: number;
  label: string;
};

/** 一次合并批次的结果 */
export type MergeOutcome = {
  /** 新写出的输出路径 */
  ok: string[];
  /** 目标已存在、按策略跳过的输出路径 */
  skipped: string[];
  /** 失败项：保留 item 本身，供「重试失败项」直接复用 */
  failed: { item: VideoItem; label: string; message: string }[];
};

/**
 * Android ≤10 专用：读 `/Android/data/<其他 App>/` 需要运行时 `READ_EXTERNAL_STORAGE`。
 *
 * 这条链此前只在 manifest 里声明了该权限、**从未在运行时申请**，因此在 ≤10 上同样
 * 必然失败（表现就是「未找到缓存」）。任何异常一律当作「未授权」。
 */
async function requestLegacyStoragePermission(): Promise<boolean> {
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * 页面状态与全部编排逻辑。
 *
 * 抽出来的理由：原先这些状态与 7 个 handler 全挤在 `app/index.tsx` 里，页面同时承担
 * 「编排」与「渲染」两件事，pi-lens 也报了复杂度/fan-out 偏高。现在页面只负责组装
 * 组件，逻辑集中在这里。
 */
export function useConverter() {
  const [dir, setDir] = useState('');
  const [items, setItems] = useState<VideoItem[]>([]);
  // 与 items 配套：决定「合并前怎么把 m4s 变成 FFmpeg 可读路径」。
  // Shizuku 扫描 → 需搬运；手动选公共目录 → 直通。
  const [materializer, setMaterializer] = useState<Materializer | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeOutcome, setMergeOutcome] = useState<MergeOutcome | null>(null);
  const [error, setError] = useState('');
  const [outputDir, setOutputDir] = useState(DEFAULT_OUTPUT_DIR);

  /** 合并进度（长批次要能看到进展） */
  const [progress, setProgress] = useState<MergeProgress | null>(null);
  /** 取消标志：合并循环在每个项开始前检查它（单条中转可达 ~450MB，不可能立即中断） */
  const cancelRef = useRef(false);

  const [shizukuStatus, setShizukuStatus] = useState<ShizukuStatus>('unsupported');
  const [shizukuInfo, setShizukuInfo] = useState<ShizukuInfo | null>(null);

  const refreshShizuku = useCallback(async () => {
    setShizukuStatus(await Shizuku.getStatus());
    setShizukuInfo(await Shizuku.getShizukuInfo());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初次拉取 Shizuku 状态；setState 均在 await 之后，不会同步触发级联渲染
    void refreshShizuku();
    const subscription = Shizuku.addStatusListener((status) => setShizukuStatus(status));
    return () => subscription.remove();
  }, [refreshShizuku]);

  /** 以 shell 身份扫描 B 站缓存（仅在 Shizuku ready 时调用） */
  const runShizukuScan = async () => {
    setBusy(true);
    setError('');
    setMergeOutcome(null);
    setItems([]);
    try {
      // 这些条目的 m4s 在 /Android/data 下，而 FFmpegKit 跑在 App 进程读不到，
      // 必须先由 shell 搬到「shell 可写、App 可读」的外部私有目录。
      // 这里把搬运策略一并装配，后续合并与「手动选择目录」共用同一套流程。
      const tempDir = await Shizuku.getExternalCacheDir();
      setMaterializer(createShizukuMaterializer(tempDir));

      // 同一份扫描逻辑，只把 FS 适配器换成 shizukuFs
      const found = await scanDirectory(DEFAULT_BILIBILI_CACHE_DIR, shizukuFs);
      setItems(found);
      setDir(DEFAULT_BILIBILI_CACHE_DIR);
      if (found.length === 0) {
        setError('B 站缓存目录下未找到可合并的视频（需要 entry.json + video.m4s + audio.m4s）。');
      }
    } catch (e) {
      setError(`Shizuku 扫描失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Shizuku 的**唯一**入口：未就绪 → 推进状态机（装 / 激活 / 授权）；就绪 → 扫描。
   */
  const handleShizukuAction = async () => {
    setError('');
    try {
      switch (shizukuStatus) {
        case 'not-installed':
          await Linking.openURL('https://shizuku.rikka.app/download/');
          return;
        case 'not-running':
          setError('Shizuku 服务未运行：请打开 Shizuku App，用「无线调试」启动，再回来。');
          return;
        case 'no-permission': {
          const granted = await Shizuku.requestPermission();
          if (!granted) setError('未获得 Shizuku 授权（可能选了「拒绝且不再询问」）。');
          await refreshShizuku();
          return;
        }
        case 'unsupported':
          setError('本机不支持 Shizuku，请改用「扫描 B 站缓存目录」或「手动选择目录」。');
          return;
        default:
          break;
      }
      await runShizukuScan();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * 用 App 自身权限扫描（blobFs）。
   *
   * 只服务两个场景：≤10 的默认目录、以及「手动选择目录」选中的公共目录 ——
   * 源文件本来就 App 可读，所以装配直通策略。
   */
  const runScan = async (path: string) => {
    setBusy(true);
    setError('');
    setMergeOutcome(null);
    setItems([]);
    try {
      const found = await scanDirectory(path);
      setItems(found);
      setMaterializer(passthroughMaterializer);
      if (found.length === 0) {
        setError('该目录下未找到 B 站缓存（需要 entry.json + video.m4s + audio.m4s）。');
      }
    } catch (e) {
      setError(`读取目录失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleScanDefault = async () => {
    if (Platform.OS === 'web') {
      setError(WEB_MESSAGE);
      return;
    }

    // Android 11+：普通权限读不到 /Android/data，给出正确指引，而不是做一次注定失败的扫描
    if (NEEDS_SHELL_FOR_APP_DATA) {
      setError(
        `本机 Android API ${ANDROID_API_LEVEL}（11+）：系统禁止普通 App 读取其他 App 的 ` +
          '/Android/data/，请改用上方的 Shizuku 按钮。',
      );
      return;
    }

    // Android ≤10：需要运行时存储读取权限（见 requestLegacyStoragePermission 注释）
    if (!(await requestLegacyStoragePermission())) {
      setError('未授予存储读取权限，无法读取 /Android/data 下的 B 站缓存。');
      return;
    }

    setDir(DEFAULT_BILIBILI_CACHE_DIR);
    await runScan(DEFAULT_BILIBILI_CACHE_DIR);
  };

  const handlePick = async () => {
    if (Platform.OS === 'web') {
      setError(WEB_MESSAGE);
      return;
    }
    try {
      const picked = await pickDirectory();
      if (!picked) return;
      setDir(picked);
      await runScan(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * 执行一批合并。
   *
   * 抽出 targets 参数，是为了让「重试失败项」复用同一条路径，而不是再写一份循环。
   */
  const runMerge = async (targets: VideoItem[]) => {
    setError('');
    setMergeOutcome(null);
    setProgress(null);
    setBusy(true);
    cancelRef.current = false;

    // 逐项容错：任意一项失败都不中断整批，也不丢弃已成功的结果。
    // （旧实现把结果写在循环之外，中途抛错时前面已写盘的文件一个都不会显示。）
    const ok: string[] = [];
    const skipped: string[] = [];
    const failed: MergeOutcome['failed'] = [];
    let cancelled = false;

    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) {
        cancelled = true;
        break;
      }
      const item = targets[i];
      const label = `P${item.page} ${item.part ?? item.title}`;
      setProgress({ done: i, total: targets.length, label });
      try {
        // 默认不覆盖已存在的输出（见 outputExists 的注释）
        if (await outputExists(item, outputDir)) {
          skipped.push(outputPathFor(item, outputDir));
        } else {
          ok.push(await mergeToMp4(item, outputDir, materializer ?? passthroughMaterializer));
        }
      } catch (e) {
        failed.push({ item, label, message: e instanceof Error ? e.message : String(e) });
      }
      // 每项结束即更新，长批次也能看到进展
      setMergeOutcome({ ok: [...ok], skipped: [...skipped], failed: [...failed] });
    }

    setProgress(null);
    setBusy(false);
    if (cancelled) {
      const done = ok.length + skipped.length + failed.length;
      setError(`已取消：本批完成 ${done} / ${targets.length} 项。`);
    }
  };

  const handleMerge = () => {
    void runMerge(items);
  };

  const handleRetryFailed = () => {
    if (mergeOutcome) void runMerge(mergeOutcome.failed.map((entry) => entry.item));
  };

  /** 请求取消：合并循环在下一项开始前检查此标志 */
  const cancelMerge = () => {
    cancelRef.current = true;
  };

  const handleRequestPermission = async () => {
    // 必须用 MANAGE_APP_ALL_FILES_ACCESS_PERMISSION（带 APP）：
    // MANAGE_ALL_FILES_ACCESS_PERMISSION 只认列表页，配上 package: data 后
    // 在多数 ROM 上解析不到任何 Activity，会静默失败并回退到 App 信息页。
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
        { data: `package:${APP_PACKAGE}` },
      );
      return;
    } catch {
      // 部分 ROM 不注册该 action，继续回退
    }
    try {
      // 退一步：打开「所有文件访问权限」列表页（需在其中手动找到本 App）
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION',
      );
      return;
    } catch {
      // 再退：App 信息页
    }
    try {
      await Linking.openSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return {
    dir,
    items,
    busy,
    mergeOutcome,
    progress,
    error,
    outputDir,
    setOutputDir,
    shizukuStatus,
    shizukuInfo,
    handleShizukuAction,
    handleScanDefault,
    handlePick,
    handleMerge,
    handleRetryFailed,
    cancelMerge,
    handleRequestPermission,
  };
}
