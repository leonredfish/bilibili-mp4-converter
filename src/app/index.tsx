import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as IntentLauncher from 'expo-intent-launcher';

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

const APP_PACKAGE = 'com.leonredfish.bilibilimp4';

export default function ConverterScreen() {
  const [dir, setDir] = useState('');
  const [items, setItems] = useState<VideoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState('');

  const runScan = async (path: string) => {
    setBusy(true);
    setError('');
    setResults([]);
    setItems([]);
    try {
      const found = await scanDirectory(path);
      setItems(found);
      if (found.length === 0) {
        setError('未找到缓存。请确认已授予「所有文件访问权限」，且缓存位于所选目录。');
      }
    } catch (e) {
      setError(`${e instanceof Error ? e.message : String(e)}（请确认已授予「所有文件访问权限」）`);
    } finally {
      setBusy(false);
    }
  };

  const handleScanDefault = () => {
    if (Platform.OS === 'web') {
      setError('目录选择与转码仅支持 Android，请在真机或模拟器上运行');
      return;
    }
    setDir(DEFAULT_BILIBILI_CACHE_DIR);
    void runScan(DEFAULT_BILIBILI_CACHE_DIR);
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
    try {
      setError('');
      setResults([]);
      setBusy(true);
      const out: string[] = [];
      for (const item of items) {
        out.push(await mergeToMp4(item, DEFAULT_OUTPUT_DIR));
      }
      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRequestPermission = async () => {
    try {
      await IntentLauncher.startActivityAsync('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION', {
        data: `package:${APP_PACKAGE}`,
      });
    } catch {
      // 部分国产 ROM（ColorOS 等）不注册该标准 intent，回退到打开应用设置页
      try {
        await Linking.openSettings();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
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

          <Pressable
            onPress={handleRequestPermission}
            disabled={busy}
            style={({ pressed }) => [styles.permissionButton, pressed && styles.pressed]}>
            <ThemedText style={styles.buttonText}>授予「所有文件访问权限」</ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary">
            跳转后在设置里找到「所有文件访问权限」（部分机型叫「允许管理所有文件」），通常在 设置 → 应用 → Bilibili MP4 → 权限 里。
          </ThemedText>

          <Pressable
            onPress={handleScanDefault}
            disabled={busy}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <ThemedText style={styles.buttonText}>扫描 B 站缓存目录</ThemedText>
          </Pressable>

          <Pressable
            onPress={handlePick}
            disabled={busy}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <ThemedText type="small">手动选择目录</ThemedText>
          </Pressable>

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

          {results.length > 0 ? (
            <ThemedView type="backgroundElement" style={styles.panel}>
              <ThemedText type="smallBold">合并完成：</ThemedText>
              {results.map((p) => (
                <ThemedText key={p} type="small" themeColor="textSecondary" numberOfLines={1}>
                  {p}
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
