import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing, gradients } from '@/theme/tokens';

const DESTINATIONS = ['山川', '湖海', '古镇', '雪原', '星空', '花田'];
const MOODS = ['细雨', '微风', '落叶', '虫鸣', '月光', '篝火', '远钟', '潮声'];
const VOICES = ['温润女声', '沉稳男声', '少年音', '自然白噪音'];

export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const [destination, setDestination] = useState<string | null>(null);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [voice, setVoice] = useState<string | null>(null);

  const toggleMood = (m: string) => {
    setSelectedMoods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>梦境工坊</Text>
      <Text style={styles.pageSubtitle}>定制你的专属入睡旅程</Text>

      {/* 步骤一：目的地 */}
      <View style={styles.stepSection}>
        <Text style={styles.stepLabel}>第一步 · 选择目的地</Text>
        <View style={styles.chipRow}>
          {DESTINATIONS.map((d) => (
            <Pressable
              key={d}
              style={[styles.chip, destination === d && styles.chipActive]}
              onPress={() => setDestination(d)}
            >
              <Text style={[styles.chipText, destination === d && styles.chipTextActive]}>{d}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 步骤二：氛围元素 */}
      <View style={styles.stepSection}>
        <Text style={styles.stepLabel}>第二步 · 挑选氛围元素</Text>
        <View style={styles.chipRow}>
          {MOODS.map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, selectedMoods.includes(m) && styles.chipActive]}
              onPress={() => toggleMood(m)}
            >
              <Text style={[styles.chipText, selectedMoods.includes(m) && styles.chipTextActive]}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 步骤三：旅伴声线 */}
      <View style={styles.stepSection}>
        <Text style={styles.stepLabel}>第三步 · 选择旅伴声线</Text>
        <View style={styles.chipRow}>
          {VOICES.map((v) => (
            <Pressable
              key={v}
              style={[styles.chip, voice === v && styles.chipActive]}
              onPress={() => setVoice(v)}
            >
              <Text style={[styles.chipText, voice === v && styles.chipTextActive]}>{v}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 生成按钮 */}
      <Pressable
        disabled={!destination || selectedMoods.length === 0 || !voice}
        style={styles.generateButtonWrap}
      >
        {({ pressed }) => (
          <LinearGradient
            colors={gradients.primary}
            style={[styles.generateButton, (!destination || selectedMoods.length === 0 || !voice) && styles.disabledButton]}
          >
            <Text style={styles.generateText}>{pressed ? '生成中…' : '生成专属旅程'}</Text>
          </LinearGradient>
        )}
      </Pressable>
      <Text style={styles.disclaimer}>生成完成后会通知你，请耐心等待</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  pageTitle: { color: colors.tx, fontSize: fontSize.hero, fontWeight: '700', paddingHorizontal: spacing.base, marginTop: spacing.lg },
  pageSubtitle: { color: colors.tx2, fontSize: fontSize.body, paddingHorizontal: spacing.base, marginTop: spacing.xs },
  stepSection: { paddingHorizontal: spacing.base, marginTop: spacing.xl },
  stepLabel: { color: colors.gold, fontSize: fontSize.bodyLg, fontWeight: '600', marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.line },
  chipActive: { borderColor: colors.vio, backgroundColor: 'rgba(139,156,255,0.12)' },
  chipText: { color: colors.tx2, fontSize: fontSize.body },
  chipTextActive: { color: colors.vio, fontWeight: '600' },
  generateButtonWrap: { marginHorizontal: spacing.base, marginTop: spacing.xxxl },
  generateButton: { height: 48, borderRadius: radius.button, justifyContent: 'center', alignItems: 'center' },
  disabledButton: { opacity: 0.4 },
  generateText: { color: '#fff', fontSize: fontSize.bodyLg, fontWeight: '600' },
  disclaimer: { color: colors.tx3, fontSize: fontSize.caption, textAlign: 'center', marginTop: spacing.md },
});
