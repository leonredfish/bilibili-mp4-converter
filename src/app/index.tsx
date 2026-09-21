import { Link, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type Feature = {
  title: string;
  description: string;
  href: Href;
  icon: SymbolName;
};

const FEATURES: Feature[] = [
  {
    title: '表单',
    description: 'TextInput、Switch、下拉选择器等输入控件的综合示例。',
    href: '/form',
    icon: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' },
  },
  {
    title: '数据',
    description: 'fetch 请求公共 API，含下拉刷新、加载与错误状态。',
    href: '/data',
    icon: {
      ios: 'list.bullet.rectangle',
      android: 'format_list_bulleted',
      web: 'format_list_bulleted',
    },
  },
  {
    title: '动画',
    description: '使用 Reanimated 实现弹簧动画、循环动画与交互动效。',
    href: '/animation',
    icon: { ios: 'sparkles', android: 'animation', web: 'animation' },
  },
  {
    title: '设置',
    description: 'Zustand 全局状态管理，支持深浅色主题切换。',
    href: '/settings',
    icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
  },
];

function Header() {
  return (
    <View style={styles.header}>
      <ThemedText type="title">React Native 演示</ThemedText>
      <ThemedText themeColor="textSecondary">
        一个展示 React Native / Expo 核心能力的示例应用。点击卡片进入对应示例。
      </ThemedText>
    </View>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const theme = useTheme();

  return (
    <Link href={feature.href} asChild>
      <Pressable style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedView type="backgroundSelected" style={styles.iconWrap}>
            <SymbolView name={feature.icon} size={22} tintColor={theme.text} />
          </ThemedView>
          <View style={styles.cardBody}>
            <ThemedText type="smallBold">{feature.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {feature.description}
            </ThemedText>
          </View>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            size={14}
            tintColor={theme.textSecondary}
          />
        </ThemedView>
      </Pressable>
    </Link>
  );
}

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={FEATURES}
          keyExtractor={(item) => item.href as string}
          renderItem={({ item }) => <FeatureCard feature={item} />}
          ListHeaderComponent={Header}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
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
  listContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  header: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
