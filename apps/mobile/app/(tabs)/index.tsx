import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getJourneys,
  getPlayback,
  type JourneyListItem,
  type PlaybackRecord,
} from '@/api/content';
import { ApiError } from '@/api/client';
import { startChapter } from '@/audio/player.service';
import { GradientPlaceholder } from '@/components/GradientPlaceholder';
import { colors, fontSize, lineHeight, radius, spacing } from '@/theme/tokens';

const CATEGORIES = [
  { label: '山川', variant: 'cool' as const },
  { label: '湖海', variant: 'cool' as const },
  { label: '古镇', variant: 'warm' as const },
  { label: '雪原', variant: 'cool' as const },
  { label: '星空', variant: 'primary' as const },
  { label: '花田', variant: 'warm' as const },
];

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, error } = useQuery({
    queryKey: ['journeys', { page: 1 }],
    queryFn: () => getJourneys({ page: 1, pageSize: 10 }),
  });

  const journeys = data?.items ?? [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 主推位 hero */}
      <View style={styles.heroSection}>
        <GradientPlaceholder variant="primary" style={styles.heroGradient}>
          <Text style={styles.heroGreeting}>晚上好，愿今夜好梦</Text>
          <Text style={styles.heroTitle}>今夜入梦</Text>
          <Text style={styles.heroSubtitle}>让声音带你走进一段安静的旅程</Text>
        </GradientPlaceholder>
      </View>

      {/* 继续收听（断点续播） */}
      <ContinueSection />

      {/* 场景分类 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>场景分类</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <Pressable key={cat.label} style={styles.categoryItem}>
              <GradientPlaceholder variant={cat.variant} style={styles.categoryIcon}>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
              </GradientPlaceholder>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 为你挑选 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>为你挑选</Text>
        {isLoading && <Text style={styles.hintText}>加载中…</Text>}
        {error && (
          <Text style={styles.errorText}>
            {error instanceof ApiError ? error.message : '加载失败，请稍后再试'}
          </Text>
        )}
        {!isLoading && !error && journeys.length === 0 && (
          <Text style={styles.hintText}>暂无推荐内容</Text>
        )}
        {journeys.map((item) => (
          <JourneyCard key={item.id} item={item} />
        ))}
      </View>
    </ScrollView>
  );
}

/** 继续收听：取最近一条播放记录，从断点恢复（§7.6） */
function ContinueSection() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const { data } = useQuery({
    queryKey: ['playback'],
    queryFn: () => getPlayback(),
  });

  const records = data ?? [];
  if (records.length === 0) {
    return null;
  }
  const latest = records.reduce((acc, cur) =>
    cur.updatedAt > acc.updatedAt ? cur : acc,
  );

  const handleContinue = async (record: PlaybackRecord): Promise<void> => {
    setStarting(true);
    try {
      await startChapter(record.chapter.journeyId, record.chapterId);
      router.push('/player');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '播放准备失败，请稍后再试';
      Alert.alert('稍后再试', msg);
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.continueCard}
        disabled={starting}
        onPress={() => void handleContinue(latest)}
      >
        <View style={styles.continueIcon}>
          <Text style={styles.continueIconText}>续</Text>
        </View>
        <View style={styles.continueBody}>
          <Text style={styles.continueLabel}>继续收听</Text>
          <Text style={styles.continueTitle} numberOfLines={1}>
            {starting ? '正在准备…' : latest.chapter.title}
          </Text>
        </View>
        <Text style={styles.continueTime}>第 {latest.chapter.index} 章</Text>
      </Pressable>
    </View>
  );
}

function JourneyCard({ item }: { item: JourneyListItem }) {
  return (
    <Link href={`/journey/${item.id}`} asChild>
      <Pressable style={styles.card}>
        <GradientPlaceholder variant="card" style={styles.cardCover}>
          {item.isFree ? (
            <View style={styles.freeBadge}>
              <Text style={styles.freeText}>免费</Text>
            </View>
          ) : null}
        </GradientPlaceholder>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          {item.subtitle ? (
            <Text style={styles.cardSubtitle} numberOfLines={1}>{item.subtitle}</Text>
          ) : null}
          <View style={styles.tagRow}>
            {item.tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  heroSection: { paddingHorizontal: spacing.base, marginBottom: spacing.xl },
  heroGradient: { height: 180, borderRadius: radius.card, padding: spacing.lg, justifyContent: 'flex-end' },
  heroGreeting: { color: colors.tx2, fontSize: fontSize.body, lineHeight: lineHeight.relaxed },
  heroTitle: { color: colors.gold, fontSize: fontSize.hero, fontWeight: '700', marginTop: spacing.xs },
  heroSubtitle: { color: colors.tx2, fontSize: fontSize.body, marginTop: spacing.xs },
  section: { paddingHorizontal: spacing.base, marginBottom: spacing.xl },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(240,206,142,0.08)',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(240,206,142,0.28)',
    padding: spacing.md,
  },
  continueIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,206,142,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueIconText: { color: colors.gold, fontSize: fontSize.bodyLg, fontWeight: '600' },
  continueBody: { flex: 1 },
  continueLabel: { color: colors.tx3, fontSize: fontSize.caption },
  continueTitle: { color: colors.tx, fontSize: fontSize.bodyLg, fontWeight: '600', marginTop: 2 },
  continueTime: { color: colors.tx3, fontSize: fontSize.caption },
  sectionTitle: { color: colors.tx, fontSize: fontSize.titleLg, fontWeight: '600', marginBottom: spacing.md },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  categoryItem: { width: '31%', aspectRatio: 1 },
  categoryIcon: { borderRadius: radius.card, justifyContent: 'center', alignItems: 'center' },
  categoryLabel: { color: colors.tx, fontSize: fontSize.bodyLg, fontWeight: '500' },
  hintText: { color: colors.tx3, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.xl },
  errorText: { color: colors.gold, fontSize: fontSize.body, textAlign: 'center', paddingVertical: spacing.xl },
  card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.card, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cardCover: { width: 88, height: 88 },
  freeBadge: { position: 'absolute', top: spacing.xs, left: spacing.xs, backgroundColor: 'rgba(7,11,24,0.7)', borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  freeText: { color: colors.green, fontSize: fontSize.caption },
  cardBody: { flex: 1, padding: spacing.md, justifyContent: 'center' },
  cardTitle: { color: colors.tx, fontSize: fontSize.bodyLg, fontWeight: '600' },
  cardSubtitle: { color: colors.tx2, fontSize: fontSize.body, marginTop: 2 },
  tagRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  tag: { backgroundColor: colors.card2, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText: { color: colors.tx2, fontSize: fontSize.caption },
});
