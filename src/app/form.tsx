import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const LEVELS = ['初级', '中级', '高级'] as const;
type Level = (typeof LEVELS)[number];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
    </View>
  );
}

export default function FormScreen() {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notify, setNotify] = useState(true);
  const [level, setLevel] = useState<Level>('初级');
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleSubmit = () => {
    Alert.alert(
      '提交成功',
      `姓名：${name || '（未填写）'}\n邮箱：${email || '（未填写）'}\n等级：${level}\n订阅通知：${notify ? '是' : '否'}`,
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText type="subtitle">表单示例</ThemedText>
            <ThemedText themeColor="textSecondary">
              演示 TextInput、Switch 与自定义下拉选择器。
            </ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <Field label="姓名">
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="请输入姓名"
                placeholderTextColor={theme.textSecondary}
                value={name}
                onChangeText={setName}
              />
            </Field>

            <Field label="邮箱">
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="you@example.com"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </Field>

            <Field label="经验等级">
              <Pressable onPress={() => setPickerVisible(true)}>
                <ThemedView type="backgroundSelected" style={styles.pickerTrigger}>
                  <ThemedText>{level}</ThemedText>
                  <SymbolView
                    name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }}
                    size={16}
                    tintColor={theme.textSecondary}
                  />
                </ThemedView>
              </Pressable>
            </Field>

            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <ThemedText type="smallBold">订阅通知</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  接收产品更新与新闻
                </ThemedText>
              </View>
              <Switch value={notify} onValueChange={setNotify} />
            </View>
          </ThemedView>

          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [styles.submit, pressed && styles.pressed]}>
            <ThemedText style={styles.submitText}>提交</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)}>
          <ThemedView type="backgroundElement" style={styles.modalCard}>
            <ThemedText type="smallBold" style={styles.modalTitle}>
              选择经验等级
            </ThemedText>
            {LEVELS.map((item) => {
              const selected = item === level;
              return (
                <Pressable
                  key={item}
                  onPress={() => {
                    setLevel(item);
                    setPickerVisible(false);
                  }}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView
                    type={selected ? 'backgroundSelected' : 'background'}
                    style={styles.modalOption}>
                    <ThemedText>{item}</ThemedText>
                    {selected && (
                      <SymbolView
                        name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                        size={16}
                        tintColor={theme.text}
                      />
                    )}
                  </ThemedView>
                </Pressable>
              );
            })}
          </ThemedView>
        </Pressable>
      </Modal>
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
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchText: {
    flex: 1,
    gap: Spacing.half,
  },
  submit: {
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  modalTitle: {
    paddingBottom: Spacing.one,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
});
