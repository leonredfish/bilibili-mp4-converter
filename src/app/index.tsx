import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  MergeActionBar,
  MergeProgressPanel,
  MergeResultPanel,
} from '@/components/merge-panel';
import { OutputDirPicker } from '@/components/output-dir-picker';
import { OutputStrategyPicker } from '@/components/output-strategy-picker';
import { ShizukuPanel } from '@/components/shizuku-panel';
import { SourceActions } from '@/components/source-actions';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoRow } from '@/components/video-row';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useConverter } from '@/hooks/use-converter';
import type { VideoItem } from '@/lib/bilibili';

const keyExtractor = (item: VideoItem, index: number) => `${item.directory}-${index}`;

/** 行间距。用 ItemSeparatorComponent 而不是 contentContainerStyle 的 gap，后者对 cell 的表现不稳 */
function ItemGap() {
  return <View style={styles.itemGap} />;
}

/**
 * 页面本体就是 FlatList。
 *
 * 这是虚拟化的硬约束：想让条目列表被回收复用，**列表必须自己当滚动容器** ——
 * FlatList 套在 ScrollView 里会退化成「一次性全渲染」，并触发
 * "VirtualizedLists should never be nested inside plain ScrollViews" 警告。
 * 所以其余区块都走 ListHeaderComponent / ListFooterComponent。
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
    outputStrategy,
    setOutputStrategy,
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
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <VideoRow item={item} />}
          ItemSeparatorComponent={ItemGap}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
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

              <OutputStrategyPicker
                value={outputStrategy}
                onChange={setOutputStrategy}
                disabled={busy}
              />

              {dir ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  目录：{dir}
                </ThemedText>
              ) : null}

              {busy ? <ActivityIndicator style={styles.indicator} /> : null}

              <MergeProgressPanel progress={progress} onCancel={cancelMerge} />

              {items.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  找到 {items.length} 个视频：
                </ThemedText>
              ) : null}
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerBlock}>
              <MergeActionBar count={items.length} busy={busy} onMerge={handleMerge} />

              <MergeResultPanel
                outcome={mergeOutcome}
                busy={busy}
                onRetryFailed={handleRetryFailed}
              />

              {error ? (
                <ThemedText type="small" themeColor="textSecondary">
                  出错：{error}
                </ThemedText>
              ) : null}
            </View>
          }
        />
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
  },
  headerBlock: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  footerBlock: {
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  header: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  indicator: {
    marginVertical: Spacing.two,
  },
  itemGap: {
    height: Spacing.two,
  },
});
