import { StyleSheet } from 'react-native';

import { ActionButton } from './action-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import type { MergeOutcome, MergeProgress } from '@/hooks/use-converter';

/**
 * 合并相关的三块，拆开是因为它们要分别放到列表的 header / footer 里
 * （条目列表已由页面的 FlatList 承担虚拟化，不能再整块塞进一个组件里）。
 */

/** 批次进度 + 取消。放列表**上方**：长批次不用滚到底就知道进行到哪、随时能取消 */
export function MergeProgressPanel({
  progress,
  onCancel,
}: {
  progress: MergeProgress | null;
  onCancel: () => void;
}) {
  if (!progress) return null;

  return (
    <ThemedView type="backgroundElement" style={styles.panel}>
      <ThemedText type="small" themeColor="textSecondary">
        正在合并 {progress.done + 1} / {progress.total}
      </ThemedText>
      <ThemedText type="smallBold" numberOfLines={1}>
        {progress.label}
      </ThemedText>
      <ActionButton variant="secondary" label="取消（当前项做完后停止）" onPress={onCancel} />
    </ThemedView>
  );
}

/** 合并按钮。放列表**之后** */
export function MergeActionBar({
  count,
  busy,
  onMerge,
}: {
  count: number;
  busy: boolean;
  onMerge: () => void;
}) {
  if (count === 0) return null;

  return (
    <ActionButton
      variant="merge"
      label={`合并 ${count} 个视频`}
      onPress={onMerge}
      disabled={busy}
    />
  );
}

/** 批次结果（成功 / 跳过 / 失败）+ 重试失败项 */
export function MergeResultPanel({
  outcome,
  busy,
  onRetryFailed,
}: {
  outcome: MergeOutcome | null;
  busy: boolean;
  onRetryFailed: () => void;
}) {
  const hasOutcome =
    !!outcome &&
    (outcome.ok.length > 0 || outcome.skipped.length > 0 || outcome.failed.length > 0);

  if (!hasOutcome || !outcome) return null;

  return (
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
        <ThemedText key={`skip-${path}`} type="small" themeColor="textSecondary" numberOfLines={1}>
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
          （跳过的项目标已存在；把上面「输出文件已存在时」改成「覆盖」或「重命名」即可重做）
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
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
