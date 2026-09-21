import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeStore } from '@/stores/theme-store';

/**
 * 返回最终生效的配色方案（'light' | 'dark'）。
 * 综合系统配色 + 用户在设置页选择的手动模式。
 */
export function useResolvedColorScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme();
  const mode = useThemeStore((state) => state.mode);

  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  return systemScheme === 'dark' ? 'dark' : 'light';
}
