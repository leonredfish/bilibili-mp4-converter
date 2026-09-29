import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';

export type ActionButtonVariant = 'primary' | 'secondary' | 'permission' | 'merge';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ActionButtonVariant;
};

/**
 * 全 App 统一的按钮。
 *
 * 抽出来的理由：同一个「Pressable + ThemedText + pressed 态」在页面里重复了 6 次，
 * 每加一个按钮都要再抄一遍样式；变体集中在这里，也避免颜色值散落。
 *
 * - primary：蓝，主操作
 * - secondary：半透明灰，次要操作（文字用主题色，不用白）
 * - permission：橙，权限相关（提示性）
 * - merge：绿，合并
 */
export function ActionButton({ label, onPress, disabled, variant = 'primary' }: Props) {
  const isSecondary = variant === 'secondary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed]}>
      <ThemedText
        type={isSecondary ? 'small' : 'default'}
        style={isSecondary ? undefined : styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: '#3c87f7',
  },
  merge: {
    backgroundColor: '#34c759',
  },
  permission: {
    backgroundColor: '#ff9500',
  },
  secondary: {
    backgroundColor: 'rgba(127,127,127,0.15)',
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
