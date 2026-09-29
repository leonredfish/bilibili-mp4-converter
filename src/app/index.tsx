import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MergePanel } from '@/components/merge-panel';
import { OutputDirPicker } from '@/components/output-dir-picker';
import { ShizukuPanel } from '@/components/shizuku-panel';
import { SourceActions } from '@/components/source-actions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useConverter } from '@/hooks/use-converter';

/**
 * 页面只做组装：状态与编排在 `useConverter()`，各区块在 `components/` 下。
 * 这样每块都能单独读、单独改，页面本身保持在「一眼能看完」的规模。
 */
export default function ConverterScreen() {
  const {
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
  } = useConverter();

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

          <ShizukuPanel
            status={shizukuStatus}
            info={shizukuInfo}
            busy={busy}
            onAction={() => void handleShizukuAction()}
          />

          <SourceActions
            busy={busy}
            onRequestPermission={() => void handleRequestPermission()}
            onScanDefault={() => void handleScanDefault()}
            onPick={() => void handlePick()}
          />

          <OutputDirPicker value={outputDir} onChange={setOutputDir} disabled={busy} />

          {dir ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              目录：{dir}
            </ThemedText>
          ) : null}

          {busy ? <ActivityIndicator style={styles.indicator} /> : null}

          <MergePanel
            items={items}
            busy={busy}
            progress={progress}
            outcome={mergeOutcome}
            onMerge={handleMerge}
            onCancel={cancelMerge}
            onRetryFailed={handleRetryFailed}
          />

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
  indicator: {
    marginVertical: Spacing.two,
  },
});
