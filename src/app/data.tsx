import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

type Post = {
  id: number;
  title: string;
  body: string;
};

const API_URL = 'https://jsonplaceholder.typicode.com/posts?_limit=20';

export default function DataScreen() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Post[] = await res.json();
      setPosts(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络请求失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 异步拉数据，setState 均在 await 之后执行，不会同步触发级联渲染
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const onRetry = () => {
    setLoading(true);
    void load();
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <ThemedText type="subtitle">数据请求</ThemedText>
              <ThemedText themeColor="textSecondary">
                从 jsonplaceholder.typicode.com 拉取数据，支持下拉刷新。
              </ThemedText>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" />
              </View>
            ) : error ? (
              <View style={styles.center}>
                <ThemedText themeColor="textSecondary">加载失败：{error}</ThemedText>
                <Pressable
                  onPress={onRetry}
                  style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                  <ThemedText type="linkPrimary">重试</ThemedText>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item }) => <PostCard post={item} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        #{post.id}
      </ThemedText>
      <ThemedText type="smallBold">{post.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {post.body}
      </ThemedText>
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
    paddingVertical: Spacing.two,
  },
  center: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.six,
  },
  retry: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
