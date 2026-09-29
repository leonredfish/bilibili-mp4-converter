import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import type { VideoItem } from '@/lib/bilibili';

/**
 * 扫描结果里的一行（FlatList 的 renderItem）。
 *
 * 每行自带卡片背景而不是共用一个大面板 —— 虚拟化后各行是独立 cell，
 * 没法再共用同一个背景容器。
 */
export function VideoRow({ item }: { item: VideoItem }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="smallBold">{item.part ?? item.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {item.title} · P{item.page}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.half,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
