import { StyleSheet } from 'react-native';

import { ChipRow } from './chip-row';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import type { OutputStrategy } from '@/lib/bilibili';

const OPTIONS: { value: OutputStrategy; label: string; hint: string }[] = [
  {
    value: 'skip',
    label: '跳过',
    hint: '已存在就不重做（默认）—— 避免一次误点把上次的成果冲掉',
  },
  {
    value: 'overwrite',
    label: '覆盖',
    hint: '直接覆盖同名文件；适合你已经确认上次结果不要了',
  },
  {
    value: 'rename',
    label: '重命名',
    hint: '另存为「xxx (2).mp4」，新旧两份都留着',
  },
];

type Props = {
  value: OutputStrategy;
  onChange: (strategy: OutputStrategy) => void;
  disabled?: boolean;
};

/** 「输出文件已存在时」怎么办：跳过 / 覆盖 / 重命名 */
export function OutputStrategyPicker({ value, onChange, disabled }: Props) {
  const current = OPTIONS.find((option) => option.value === value);

  return (
    <ThemedView style={styles.block}>
      <ThemedText type="small" themeColor="textSecondary">
        输出文件已存在时
      </ThemedText>

      <ChipRow options={OPTIONS} value={value} onChange={onChange} disabled={disabled} />

      {current ? (
        <ThemedText type="small" themeColor="textSecondary">
          {current.hint}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
});
