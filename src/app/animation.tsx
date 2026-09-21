import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

function BounceBox() {
  const scale = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPress = () => {
    scale.set(withSequence(withSpring(1.4, { damping: 10 }), withSpring(1, { damping: 10 })));
  };

  return (
    <Pressable onPress={onPress} style={styles.demoArea}>
      <Animated.View style={[styles.box, styles.accentBox, style]}>
        <ThemedText style={styles.boxLabel}>点我弹跳</ThemedText>
      </Animated.View>
    </Pressable>
  );
}

function SpinBox() {
  const rotation = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const onPress = () => {
    rotation.set(withTiming(rotation.value + 180, { duration: 400 }));
  };

  return (
    <Pressable onPress={onPress} style={styles.demoArea}>
      <Animated.View style={[styles.box, styles.spinBox, style]}>
        <ThemedText style={styles.boxLabel}>点我旋转</ThemedText>
      </Animated.View>
    </Pressable>
  );
}

function PulseBox() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withRepeat(withTiming(1, { duration: 1000 }), -1, true));
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.25 }],
    opacity: 1 - progress.value * 0.4,
  }));

  return (
    <Animated.View style={styles.demoArea}>
      <Animated.View style={[styles.box, styles.pulseBox, style]}>
        <ThemedText style={styles.boxLabel}>循环呼吸</ThemedText>
      </Animated.View>
    </Animated.View>
  );
}

export default function AnimationScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">动画示例</ThemedText>
            <ThemedText themeColor="textSecondary">
              基于 react-native-reanimated 的弹簧、旋转与循环动画。
            </ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">弹簧动画（withSpring）</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              点击方块触发弹性缩放，使用 withSequence + withSpring。
            </ThemedText>
            <BounceBox />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">时序动画（withTiming）</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              点击方块旋转 180°，使用 withTiming。
            </ThemedText>
            <SpinBox />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">循环动画（withRepeat）</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              无限循环的缩放 + 透明度呼吸效果。
            </ThemedText>
            <PulseBox />
          </ThemedView>
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
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  demoArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.four,
  },
  box: {
    width: 120,
    height: 120,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentBox: {
    backgroundColor: '#3c87f7',
  },
  spinBox: {
    backgroundColor: '#34c759',
  },
  pulseBox: {
    backgroundColor: '#ff9500',
  },
  boxLabel: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
