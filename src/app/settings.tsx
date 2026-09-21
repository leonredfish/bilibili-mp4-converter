import Constants from 'expo-constants';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useThemeStore, type ThemeMode } from '@/stores/theme-store';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type Option = {
  value: ThemeMode;
  label: string;
  description: string;
  icon: SymbolName;
};

const OPTIONS: Option[] = [
  {
    value: 'light',
    label: '浅色',
    description: '始终使用浅色主题',
    icon: { ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' },
  },
  {
    value: 'dark',
    label: '深色',
    description: '始终使用深色主题',
    icon: { ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' },
  },
  {
    value: 'system',
    label: '跟随系统',
    description: '跟随系统配色自动切换',
    icon: { ios: 'circle.lefthalf.filled', android: 'brightness_auto', web: 'brightness_auto' },
  },
];

export default function SettingsScreen() {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const resolved = useResolvedColorScheme();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">设置</ThemedText>
            <ThemedText themeColor="textSecondary">
              演示 Zustand 全局状态管理。当前生效主题：{resolved === 'dark' ? '深色' : '浅色'}。
            </ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            {OPTIONS.map((option) => {
              const selected = mode === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMode(option.value)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView
                    type={selected ? 'backgroundSelected' : 'backgroundElement'}
                    style={styles.option}>
                    <SymbolView name={option.icon} size={22} tintColor={theme.text} />
                    <View style={styles.optionText}>
                      <ThemedText type="smallBold">{option.label}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {option.description}
                      </ThemedText>
                    </View>
                    {selected && (
                      <SymbolView
                        name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                        size={18}
                        tintColor={theme.text}
                      />
                    )}
                  </ThemedView>
                </Pressable>
              );
            })}
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            提示：主题状态定义在 src/stores/theme-store.ts，通过 useResolvedColorScheme 分发到全局。
            版本 v{Constants.expoConfig?.version ?? '1.0.0'} · Expo SDK 57
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  header: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.three,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  optionText: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
