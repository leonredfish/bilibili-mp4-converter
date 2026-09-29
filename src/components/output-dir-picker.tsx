import { Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_OUTPUT_DIR } from '@/lib/bilibili';

/**
 * 输出目录预设。
 *
 * 这里用**真实路径**而不是 SAF 选目录：FFmpegKit 需要直接文件路径，
 * SAF 的 tree URI 它用不了（要转存一道，得不偿失）。
 */
const PRESETS = [
  { label: 'Movies', path: '/storage/emulated/0/Movies' },
  { label: 'Download', path: '/storage/emulated/0/Download' },
  { label: 'DCIM', path: '/storage/emulated/0/DCIM' },
];

type Props = {
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
};

export function OutputDirPicker({ value, onChange, disabled }: Props) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.block}>
      <ThemedText type="small" themeColor="textSecondary">
        输出目录（FFmpeg 需要直接路径，所以是真实路径而非 SAF URI）
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

      <ThemedView style={styles.presetRow}>
        {PRESETS.map((preset) => (
          <Pressable
            key={preset.path}
            onPress={() => onChange(preset.path)}
            disabled={disabled}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView
              type={value === preset.path ? 'backgroundSelected' : 'backgroundElement'}
              style={styles.presetChip}>
              <ThemedText type="small">{preset.label}</ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </ThemedView>
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
  presetRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  presetChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
