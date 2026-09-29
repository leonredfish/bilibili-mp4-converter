import { StyleSheet } from 'react-native';

import { ActionButton } from './action-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import type { MergeOutcome, MergeProgress } from '@/hooks/use-converter';
import type { VideoItem } from '@/lib/bilibili';

type Props = {
  items: VideoItem[];
  busy: boolean;
  progress: MergeProgress | null;
  outcome: MergeOutcome | null;
  onMerge: () => void;
  onCancel: () => void;
  onRetryFailed: () => void;
};

/** 合并相关的一切：批次进度/取消、待合并条目、批次结果/重试 */
export function MergePanel({
  items,
  busy,
  progress,
  outcome,
  onMerge,
  onCancel,
  onRetryFailed,
}: Props) {
  const hasOutcome =
    !!outcome &&
    (outcome.ok.length > 0 || outcome.skipped.length > 0 || outcome.failed.length > 0);

  return (
    <>
      {progress ? (
        <ThemedView type="backgroundElement" style={styles.panel}>
          <ThemedText type="small" themeColor="textSecondary">
            正在合并 {progress.done + 1} / {progress.total}
          </ThemedText>
          <ThemedText type="smallBold" numberOfLines={1}>
            {progress.label}
          </ThemedText>
          <ActionButton
            variant="secondary"
            label="取消（当前项做完后停止）"
            onPress={onCancel}
          />
        </ThemedView>
      ) : null}

      {items.length > 0 ? (
        <ThemedView type="backgroundElement" style={styles.panel}>
          <ThemedText type="small" themeColor="textSecondary">
            找到 {items.length} 个视频：
          </ThemedText>
          {items.map((item, index) => (
            <ThemedView key={`${item.directory}-${index}`} style={styles.row}>
              <ThemedText type="smallBold">{item.part ?? item.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {item.title} · P{item.page}
              </ThemedText>
            </ThemedView>
          ))}
          <ActionButton
            variant="merge"
            label={`合并 ${items.length} 个视频`}
            onPress={onMerge}
            disabled={busy}
          />
        </ThemedView>
      ) : null}

      {hasOutcome && outcome ? (
        <ThemedView type="backgroundElement" style={styles.panel}>
          <ThemedText type="smallBold">
            合并完成：成功 {outcome.ok.length} · 跳过 {outcome.skipped.length} · 失败{' '}
            {outcome.failed.length}
          </ThemedText>

          {outcome.ok.map((path) => (
            <ThemedText key={path} type="small" themeColor="textSecondary" numberOfLines={1}>
              ✓ {path}
            </ThemedText>
          ))}

          {outcome.skipped.map((path) => (
            <ThemedText
              key={`skip-${path}`}
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}>
              ↷ 已存在跳过：{path}
            </ThemedText>
          ))}

          {outcome.failed.map((entry, index) => (
            <ThemedText key={`fail-${index}-${entry.label}`} type="small" numberOfLines={3}>
              ✗ {entry.label} —— {entry.message}
            </ThemedText>
          ))}

          {outcome.skipped.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              （跳过的文件已存在；要重做请先删掉对应 mp4）
            </ThemedText>
          ) : null}

          {outcome.failed.length > 0 ? (
            <ActionButton
              variant="secondary"
              label={`重试失败的 ${outcome.failed.length} 项`}
              onPress={onRetryFailed}
              disabled={busy}
            />
          ) : null}
        </ThemedView>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
