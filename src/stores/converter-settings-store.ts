import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_OUTPUT_DIR, type OutputStrategy } from '@/lib/bilibili';

interface ConverterSettingsState {
  /**
   * 输出目录。存的是**真实路径**而不是 SAF URI —— FFmpegKit 需要直接文件路径。
   *
   * 这里保留用户输入的**原始字符串**（含空串）：输入框要能自由清空重打，
   * 不能一边打字一边被规范化。空值的兜底交给使用方（见 use-converter）。
   */
  outputDir: string;
  /** 输出文件已存在时的策略（默认「跳过」，与 M4 行为一致，最不容易误操作） */
  outputStrategy: OutputStrategy;
  setOutputDir: (dir: string) => void;
  setOutputStrategy: (strategy: OutputStrategy) => void;
}

/**
 * 转换设置（Zustand + persist 持久化到 AsyncStorage）。
 *
 * 为什么值得持久化：一次全量是 19 条 × ~450MB、要跑几十分钟，用户把自己的输出
 * 目录和「已存在怎么办」调好之后，重启 App 又被打回默认，等于每次都要重设。
 *
 * 为什么放 store 而不是留在 use-converter 的 useState：这两项与「本次扫到了什么」
 * 无关，是跨会话的用户偏好，和主题属于同一类状态。
 */
export const useConverterSettingsStore = create<ConverterSettingsState>()(
  persist(
    (set) => ({
      outputDir: DEFAULT_OUTPUT_DIR,
      outputStrategy: 'skip',
      setOutputDir: (outputDir) => set({ outputDir }),
      setOutputStrategy: (outputStrategy) => set({ outputStrategy }),
    }),
    {
      name: 'converter-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
