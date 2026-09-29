import { Platform } from 'react-native';

/**
 * 各厂商 ROM 里「所有文件访问权限」的手动入口。
 *
 * 这个权限是**特殊权限**：没有运行时弹窗，只能去设置里手动开；而各家 ROM 的入口
 * 位置差别很大（有的在「隐私保护」下、有的在「应用管理」里），所以按厂商给一条
 * 具体路径，而不是在 UI 里列一大串。完整对照表见 README。
 *
 * 来源：华为官方支持页、小米/OPPO 开发者文档；其中 OPPO/一加/realme 一行已在
 * 真机（OnePlus / ColorOS）上实测过。
 */
export const ALL_FILES_ACCESS_ENTRIES: { match: RegExp; label: string; path: string }[] = [
  {
    match: /xiaomi|redmi|poco/i,
    label: '小米/红米/POCO',
    path: '设置 → 隐私保护 → 特殊权限设置 → 所有文件访问权限',
  },
  {
    match: /huawei|honor/i,
    label: '华为/荣耀',
    path: '设置 → 应用和服务 → 应用管理 → 本 App → 权限 → 媒体和文件 → 所有文件',
  },
  {
    match: /oppo|oneplus|realme|heytap/i,
    label: 'OPPO/一加/realme',
    path: '设置 → 隐私 → 权限管理器 → 文件 → 查看更多可以访问所有文件的应用',
  },
  {
    match: /samsung/i,
    label: '三星',
    path: '设置 → 应用程序 → 本 App → 权限 → 文件和媒体 → 允许管理所有文件',
  },
];

const GENERIC_ALL_FILES_ACCESS_ENTRY = {
  label: '通用',
  path: '设置 → 应用 → 特殊应用权限 → 所有文件访问权限',
};

/** 按本机厂商选一条具体路径；认不出厂商时退回通用入口 */
export function resolveAllFilesAccessEntry(): { label: string; path: string } {
  // SAFETY: RN 的 `Platform.constants` 在 Android 运行时确实带有 Manufacturer 字段，
  // 但它的 TS 类型（PlatformConstants）并未声明该字段。这里只读取一个**可选**字符串，
  // 读不到（包括非 Android 平台）就退化为空串，由下面的回退逻辑处理。
  const constants = Platform.constants as unknown as { Manufacturer?: string } | undefined;
  const manufacturer = String(constants?.Manufacturer ?? '');
  return (
    ALL_FILES_ACCESS_ENTRIES.find((entry) => entry.match.test(manufacturer)) ??
    GENERIC_ALL_FILES_ACCESS_ENTRY
  );
}

/** 本机对应的入口（模块加载时解析一次） */
export const ALL_FILES_ACCESS_ENTRY = resolveAllFilesAccessEntry();
