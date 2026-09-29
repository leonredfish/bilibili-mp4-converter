import { StyleSheet } from 'react-native';
import type { ShizukuInfo, ShizukuStatus } from 'react-native-shizuku';

import { ActionButton } from './action-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { ANDROID_API_LEVEL, NEEDS_SHELL_FOR_APP_DATA } from '@/lib/fs-adapter';

/** 按钮文案按状态机映射（ready 时点它就是扫描） */
const ACTION_LABEL: Record<ShizukuStatus, string> = {
  unsupported: '本机不支持 Shizuku',
  'not-installed': '安装 Shizuku',
  'not-running': '激活 Shizuku',
  'no-permission': '授权 Shizuku',
  ready: '用 Shizuku 读取 B 站缓存',
};

type Props = {
  status: ShizukuStatus;
  info: ShizukuInfo | null;
  busy: boolean;
  onAction: () => void;
};

/**
 * Shizuku 的**唯一**入口：未就绪时按钮推进状态机（装 / 激活 / 授权），
 * 就绪后同一个按钮直接扫描 B 站缓存 —— 不再让用户在两处分别点。
 */
export function ShizukuPanel({ status, info, busy, onAction }: Props) {
  return (
    <ThemedView type="backgroundElement" style={styles.panel}>
      <ActionButton label={ACTION_LABEL[status]} onPress={onAction} disabled={busy} />

      <ThemedText type="small" themeColor="textSecondary">
        {status === 'ready'
          ? `Shizuku 已就绪${info ? ` · v${info.versionName} (API ${info.apiVersion})` : ''}`
          : `Shizuku 状态：${status}`}
        {'\n'}
        {NEEDS_SHELL_FOR_APP_DATA
          ? `✅ 本机（Android API ${ANDROID_API_LEVEL}）适用。需 Shizuku 已装并激活；11+ 读 /Android/data 只能走它。`
          : `本机（Android API ${ANDROID_API_LEVEL}）非必需 —— 下面的「扫描 B 站缓存目录」就够了。`}
      </ThemedText>
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
