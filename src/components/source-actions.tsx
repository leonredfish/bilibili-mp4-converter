import { ThemedText } from './themed-text';
import { ActionButton } from './action-button';

import { ALL_FILES_ACCESS_ENTRY } from '@/constants/all-files-access';
import { ANDROID_API_LEVEL, NEEDS_SHELL_FOR_APP_DATA } from '@/lib/fs-adapter';

type Props = {
  busy: boolean;
  onRequestPermission: () => void;
  onScanDefault: () => void;
  onPick: () => void;
};

/**
 * 三个「取源」入口 + 各自的本机适用性备注。
 *
 * 注意这里保留了**两个扫描按钮**（默认目录 / 手动选择），是刻意的：读 B 站默认缓存
 * 的可行方式随 Android 版本不同（≤10 用普通权限、11+ 只能走 shell），两个入口各有
 * 适用版本，所以按钮下方都会标注本机是否适用。
 */
export function SourceActions({ busy, onRequestPermission, onScanDefault, onPick }: Props) {
  return (
    <>
      <ActionButton
        variant="permission"
        label="授予「所有文件访问权限」"
        onPress={onRequestPermission}
        disabled={busy}
      />
      <ThemedText type="small" themeColor="textSecondary">
        特殊权限，无运行时弹窗，需手动开（App 内「权限」页里没有它）。{'\n'}
        {ALL_FILES_ACCESS_ENTRY.label}：{ALL_FILES_ACCESS_ENTRY.path}
        {'\n'}路径不符就在设置里搜「所有文件」。
      </ThemedText>

      <ActionButton label="扫描 B 站缓存目录" onPress={onScanDefault} disabled={busy} />
      <ThemedText type="small" themeColor="textSecondary">
        {NEEDS_SHELL_FOR_APP_DATA
          ? `⚠️ 本机（Android API ${ANDROID_API_LEVEL}）不适用 —— 请改用上面 Shizuku 面板里的按钮。`
          : `✅ 本机（Android API ${ANDROID_API_LEVEL}）适用，首次会申请存储读取权限。`}
        {'\n'}适用于 Android 10 及以下。Android 11 起系统禁止普通 App 读取其他 App 的
        /Android/data/，11+ 只能走 Shizuku。
      </ThemedText>

      <ActionButton variant="secondary" label="手动选择目录" onPress={onPick} disabled={busy} />
      <ThemedText type="small" themeColor="textSecondary">
        所有版本通用。适用于缓存已导出到公共目录（如 Download/）的情况，不依赖任何特殊权限。
      </ThemedText>
    </>
  );
}
