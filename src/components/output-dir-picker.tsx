import { StyleSheet, TextInput } from 'react-native';

import { ActionButton } from './action-button';
import { ChipRow } from './chip-row';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_OUTPUT_DIR } from '@/lib/bilibili';

/**
 * 输出目录预设。
 *
 * 这里存的是**真实路径**而不是 SAF URI：FFmpegKit 需要直接文件路径，tree URI 它用不了。
 * 但入口仍可以是 SAF ——「用系统选择器选目录」挑完后会经 `decodeDirectoryUri()`
 * 转成真实路径（与「手动选择目录」取源目录是同一条通路）。
 */
const PRESETS: { value: string; label: string }[] = [
  { value: '/storage/emulated/0/Movies', label: 'Movies' },
  { value: '/storage/emulated/0/Download', label: 'Download' },
  { value: '/storage/emulated/0/DCIM', label: 'DCIM' },
];

type Props = {
  value: string;
  onChange: (path: string) => void;
  onPick: () => void;
  disabled?: boolean;
};

export function OutputDirPicker({ value, onChange, onPick, disabled }: Props) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.block}>
      <ThemedText type="small" themeColor="textSecondary">
        输出目录（存的必须是真实路径：FFmpegKit 要直接路径，用不了 SAF 的 tree URI）
      </ThemedText>

      <TextInput
        style={[styles.input, { color: theme.text }]}
        value={value}
        onChangeText={onChange}
        placeholder={DEFAULT_OUTPUT_DIR}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />

      <ChipRow options={PRESETS} value={value} onChange={onChange} disabled={disabled} />

      <ActionButton
        variant="secondary"
        label="用系统选择器选目录"
        onPress={onPick}
        disabled={disabled}
      />
      <ThemedText type="small" themeColor="textSecondary">
        选完自动转成真实路径；也可以在输入框里直接改。取消选择不会改动当前值。
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
});
