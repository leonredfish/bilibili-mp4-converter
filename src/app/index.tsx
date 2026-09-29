import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Shizuku from 'react-native-shizuku';
import type { ShizukuStatus } from 'react-native-shizuku';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  DEFAULT_BILIBILI_CACHE_DIR,
  DEFAULT_OUTPUT_DIR,
  mergeToMp4,
  pickDirectory,
  scanDirectory,
  type VideoItem,
} from '@/lib/bilibili';
import { ANDROID_API_LEVEL, NEEDS_SHELL_FOR_APP_DATA } from '@/lib/fs-adapter';
import { passthroughMaterializer, type Materializer } from '@/lib/materializer';
import { createShizukuMaterializer } from '@/lib/shizuku-materializer';
import { shizukuFs } from '@/lib/shizuku-fs';

const APP_PACKAGE = 'com.leonredfish.bilibilimp4';

/** Shizuku 按钮文案（按状态机映射） */
const SHIZUKU_BUTTON_LABEL: Record<ShizukuStatus, string> = {
  unsupported: '本机不支持 Shizuku',
  'not-installed': '安装 Shizuku',
  'not-running': '激活 Shizuku',
  'no-permission': '授权 Shizuku',
  ready: 'Shizuku 已就绪',
};

/** 一次合并批次的结果：成功的输出路径 + 失败的条目与原因 */
type MergeOutcome = {
  ok: string[];
  failed: { label: string; message: string }[];
};

/**
 * 各厂商 ROM 里「所有文件访问权限」的手动入口。
 *
 * 这个权限是**特殊权限**：没有运行时弹窗，只能去设置里手动开；而各家 ROM 的入口
 * 位置差别很大（有的在「隐私保护」下，有的在「应用管理」里），所以按厂商给一条
 * 具体路径，而不是列一大串。完整对照表见 README。
 *
 * 来源：华为官方支持页、小米/OPPO 开发者文档、以及各 ROM 的实际设置层级。
 */
const ALL_FILES_ACCESS_ENTRIES: { match: RegExp; label: string; path: string }[] = [
  {
    match: /xiaomi|redmi|poco/i,
    label: '小米/红米/POCO',
    path: '设置 → 隐私保护 → 特殊权限设置 → 所有文件访问权限',
  },
  {
    match: /huawei|honor/i,
    label: '华为/荣耀',
    path: '设置 → 应用和服务 → 应用管理 → 本 App → 权限 → 媒体和文件 → 所有文件',
  },
  {
    match: /oppo|oneplus|realme|heytap/i,
    label: 'OPPO/一加/realme',
    path: '设置 → 隐私 → 权限管理器 → 文件 → 查看更多可以访问所有文件的应用',
  },
  {
    match: /samsung/i,
    label: '三星',
    path: '设置 → 应用程序 → 本 App → 权限 → 文件和媒体 → 允许管理所有文件',
  },
];

const GENERIC_ALL_FILES_ACCESS_ENTRY = {
  label: '通用',
  path: '设置 → 应用 → 特殊应用权限 → 所有文件访问权限',
};

/** 按本机厂商选一条具体路径；认不出厂商时退回通用入口 */
function resolveAllFilesAccessEntry(): { label: string; path: string } {
  // SAFETY: RN 的 `Platform.constants` 在 Android 运行时确实带有 Manufacturer 字段，
  // 但它的 TS 类型（PlatformConstants）并未声明该字段。这里只读取一个**可选**字符串，
  // 读不到（包括非 Android 平台）就退化为空串，由下面的回退逻辑处理。
  const constants = Platform.constants as unknown as { Manufacturer?: string } | undefined;
  const manufacturer = String(constants?.Manufacturer ?? '');
  return (
    ALL_FILES_ACCESS_ENTRIES.find((entry) => entry.match.test(manufacturer)) ??
    GENERIC_ALL_FILES_ACCESS_ENTRY
  );
}

const ALL_FILES_ACCESS_ENTRY = resolveAllFilesAccessEntry();

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

export default function ConverterScreen() {
  const [dir, setDir] = useState('');
  const [items, setItems] = useState<VideoItem[]>([]);
  // 与 items 配套：决定「合并前怎么把 m4s 变成 FFmpeg 可读路径」。
  // Shizuku 扫描 → 需搬运；手动选公共目录 → 直通。
  const [materializer, setMaterializer] = useState<Materializer | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeOutcome, setMergeOutcome] = useState<MergeOutcome | null>(null);
  const [error, setError] = useState('');

  const [shizukuStatus, setShizukuStatus] = useState<ShizukuStatus>('unsupported');
  const [shizukuInfo, setShizukuInfo] = useState<Shizuku.ShizukuInfo | null>(null);
  const [shizukuResult, setShizukuResult] = useState('');

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

  const handleShizukuPress = async () => {
    setError('');
    try {
      switch (shizukuStatus) {
        case 'not-installed':
          await Linking.openURL('https://shizuku.rikka.app/download/');
          break;
        case 'not-running':
          setError('Shizuku 服务未运行：请打开 Shizuku App，按引导用「无线调试」启动，再回来点「刷新」。');
          break;
        case 'no-permission': {
          const granted = await Shizuku.requestPermission();
          if (!granted) setError('未获得 Shizuku 授权（可能选了「拒绝且不再询问」）。');
          await refreshShizuku();
          break;
        }
        case 'ready':
          setError('Shizuku 已就绪。文件读取能力将在 M1（UserService）接入。');
          break;
        default:
          setError('当前设备/系统不支持 Shizuku。');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleShizukuScan = async () => {
    setError('');
    setShizukuResult('扫描中…');
    try {
      const id = await Shizuku.exec('id');
      // 同一份扫描逻辑，只把 FS 适配器换成 shizukuFs
      const found = await scanDirectory(DEFAULT_BILIBILI_CACHE_DIR, shizukuFs);

      // M3：这些条目的 m4s 在 /Android/data 下，而 FFmpegKit 跑在 App 进程读不到，
      // 必须先由 shell 搬到「shell 可写、App 可读」的外部私有目录。这里把搬运
      // 策略一并装配，后续 handleMerge 与「手动选择目录」共用同一套合并流程。
      const tempDir = await Shizuku.getExternalCacheDir();
      setMaterializer(createShizukuMaterializer(tempDir));

      setItems(found);
      setMergeOutcome(null);
      setDir(DEFAULT_BILIBILI_CACHE_DIR);

      const lines = [
        `身份：${id.stdout.trim().split(' ')[0]}`,
        `scanDirectory(缓存目录, shizukuFs) → 找到 ${found.length} 个视频`,
        `中转目录：${tempDir}`,
        ...found.slice(0, 4).map((v) => `  P${v.page} ${v.part ?? v.title}`),
        found.length > 4 ? `  …（共 ${found.length} 个）` : '',
      ];
      setShizukuResult(lines.filter(Boolean).join('\n'));
    } catch (e) {
      setShizukuResult(`失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const runScan = async (path: string) => {
    setBusy(true);
    setError('');
    setMergeOutcome(null);
    setItems([]);
    try {
      const found = await scanDirectory(path);
      setItems(found);
      // 本函数只服务 blobFs 场景（≤10 的默认目录 / 手动选的公共目录）：
      // 源文件本来就 App 可读，直接喂给 FFmpeg 即可，无需搬运。
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
      setError('目录选择与转码仅支持 Android，请在真机或模拟器上运行');
      return;
    }

    // Android 11+：普通权限读不到 /Android/data，给出正确指引，而不是做一次注定失败的扫描
    if (NEEDS_SHELL_FOR_APP_DATA) {
      setError(
        `本机 Android API ${ANDROID_API_LEVEL}（11+）：系统禁止普通 App 读取其他 App 的 ` +
          '/Android/data/，请改用「Shizuku 扫描 B 站缓存」。',
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
      setError('目录选择与转码仅支持 Android，请在真机或模拟器上运行');
      return;
    }
    try {
      const d = await pickDirectory();
      if (!d) return;
      setDir(d);
      await runScan(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleMerge = async () => {
    setError('');
    setMergeOutcome(null);
    setBusy(true);

    // 逐项容错：任意一项失败都不中断整批，也不丢弃已成功的结果。
    // 旧实现把 setResults 写在循环之外，一旦中途抛错，前面已经写盘的文件
    // 一个都不会显示，用户会误以为全失败了。
    const ok: string[] = [];
    const failed: { label: string; message: string }[] = [];

    for (const item of items) {
      const label = `P${item.page} ${item.part ?? item.title}`;
      try {
        ok.push(await mergeToMp4(item, DEFAULT_OUTPUT_DIR, materializer ?? passthroughMaterializer));
      } catch (e) {
        failed.push({ label, message: e instanceof Error ? e.message : String(e) });
      }
      // 每项结束即更新，长批次也能看到进展
      setMergeOutcome({ ok: [...ok], failed: [...failed] });
    }

    setBusy(false);
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
      await IntentLauncher.startActivityAsync('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION');
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedView style={styles.header}>
            <ThemedText type="subtitle">Bilibili MP4</ThemedText>
            <ThemedText themeColor="textSecondary">
              将 B 站缓存的 video.m4s + audio.m4s 无损合并为 MP4。
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.panel}>
            <ThemedText type="smallBold">Shizuku（M0 诊断）</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              状态：{shizukuStatus}
              {shizukuInfo
                ? ` · v${shizukuInfo.versionName} (API ${shizukuInfo.apiVersion})`
                : ''}
            </ThemedText>
            <Pressable
              onPress={handleShizukuPress}
              disabled={busy}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <ThemedText style={styles.buttonText}>
                {SHIZUKU_BUTTON_LABEL[shizukuStatus]}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => void refreshShizuku()}
              disabled={busy}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <ThemedText type="small">刷新 Shizuku 状态</ThemedText>
            </Pressable>

            <Pressable
              onPress={handleShizukuScan}
              disabled={busy}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <ThemedText type="small">Shizuku 扫描 B 站缓存</ThemedText>
            </Pressable>

            <ThemedText type="small" themeColor="textSecondary">
              {NEEDS_SHELL_FOR_APP_DATA
                ? `✅ 本机（Android API ${ANDROID_API_LEVEL}）适用。`
                : `本机（Android API ${ANDROID_API_LEVEL}）非必需，用「扫描 B 站缓存目录」即可。`}
              {'\n'}适用于 Android 11 及以上（需 Shizuku 已装并激活）；以 shell 身份读取，是 11+
              读 /Android/data/ 的唯一途径。
            </ThemedText>

            {shizukuResult ? (
              <ThemedText type="small" themeColor="textSecondary">
                {shizukuResult}
              </ThemedText>
            ) : null}
          </ThemedView>

          <Pressable
            onPress={handleRequestPermission}
            disabled={busy}
            style={({ pressed }) => [styles.permissionButton, pressed && styles.pressed]}>
            <ThemedText style={styles.buttonText}>授予「所有文件访问权限」</ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary">
            特殊权限，无运行时弹窗，需手动开（App 内「权限」页里没有它）。{'\n'}
            {ALL_FILES_ACCESS_ENTRY.label}：{ALL_FILES_ACCESS_ENTRY.path}
            {'\n'}路径不符就在设置里搜「所有文件」。
          </ThemedText>

          <Pressable
            onPress={() => void handleScanDefault()}
            disabled={busy}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedText style={styles.buttonText}>扫描 B 站缓存目录</ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary">
            {NEEDS_SHELL_FOR_APP_DATA
              ? `⚠️ 本机（Android API ${ANDROID_API_LEVEL}）不适用 —— 请改用「Shizuku 扫描 B 站缓存」。`
              : `✅ 本机（Android API ${ANDROID_API_LEVEL}）适用，首次会申请存储读取权限。`}
            {'\n'}适用于 Android 10 及以下。Android 11 起系统禁止普通 App 读取其他 App 的
            /Android/data/，11+ 只能走 Shizuku。
          </ThemedText>

          <Pressable
            onPress={handlePick}
            disabled={busy}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <ThemedText type="small">手动选择目录</ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary">
            所有版本通用。适用于缓存已导出到公共目录（如 Download/）的情况，不依赖任何特殊权限。
          </ThemedText>

          {dir ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              目录：{dir}
            </ThemedText>
          ) : null}

          {busy ? <ActivityIndicator style={styles.indicator} /> : null}

          {items.length > 0 ? (
            <ThemedView type="backgroundElement" style={styles.panel}>
              <ThemedText type="small" themeColor="textSecondary">
                找到 {items.length} 个视频：
              </ThemedText>
              {items.map((item, i) => (
                <ThemedView key={`${item.directory}-${i}`} style={styles.row}>
                  <ThemedText type="smallBold">{item.part ?? item.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.title} · P{item.page}
                  </ThemedText>
                </ThemedView>
              ))}
              <Pressable
                onPress={handleMerge}
                disabled={busy}
                style={({ pressed }) => [styles.button, styles.mergeButton, pressed && styles.pressed]}>
                <ThemedText style={styles.buttonText}>合并 {items.length} 个视频</ThemedText>
              </Pressable>
            </ThemedView>
          ) : null}

          {mergeOutcome && (mergeOutcome.ok.length > 0 || mergeOutcome.failed.length > 0) ? (
            <ThemedView type="backgroundElement" style={styles.panel}>
              <ThemedText type="smallBold">
                合并完成：成功 {mergeOutcome.ok.length} / 失败 {mergeOutcome.failed.length}
              </ThemedText>

              {mergeOutcome.ok.map((p) => (
                <ThemedText key={p} type="small" themeColor="textSecondary" numberOfLines={1}>
                  ✓ {p}
                </ThemedText>
              ))}

              {mergeOutcome.failed.map((f, i) => (
                <ThemedText key={`fail-${i}-${f.label}`} type="small" numberOfLines={3}>
                  ✗ {f.label} —— {f.message}
                </ThemedText>
              ))}
            </ThemedView>
          ) : null}

          {error ? (
            <ThemedText type="small" themeColor="textSecondary">
              出错：{error}
            </ThemedText>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  button: {
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  permissionButton: {
    backgroundColor: '#ff9500',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  mergeButton: {
    backgroundColor: '#34c759',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'rgba(127,127,127,0.15)',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  indicator: {
    marginVertical: Spacing.two,
  },
  panel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  row: {
    gap: Spacing.half,
    paddingVertical: Spacing.one,
  },
});
