import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getJourneyDetail } from '@/api/content';
import { ApiError } from '@/api/client';
import { getEntitlement } from '@/api/billing';
import { startChapter } from '@/audio/player.service';
import { GradientPlaceholder } from '@/components/GradientPlaceholder';
import { colors, fontSize, lineHeight, radius, spacing, gradients, sizes } from '@/theme/tokens';

/** 业务错误码：4001 需要订阅 / 4002 订阅已过期（与 packages/shared error-codes 一致） */
const SUBSCRIPTION_ERROR_CODES = new Set([4001, 4002]);

function isSubscriptionError(err: unknown): boolean {
  return err instanceof ApiError && SUBSCRIPTION_ERROR_CODES.has(err.code);
}

export default function JourneyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['journey', id],
    queryFn: () => getJourneyDetail(id),
    enabled: !!id,
  });
  const entitlementQuery = useQuery({
    queryKey: ['entitlement'],
    queryFn: getEntitlement,
  });

  if (isLoading) {
    return <View style={styles.center}><Text style={styles.hintText}>加载中…</Text></View>;
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error instanceof ApiError ? error.message : '加载失败'}</Text>
        <Pressable onPress={router.back}><Text style={styles.linkText}>返回</Text></Pressable>
      </View>
    );
  }
  if (!data) return null;

  const firstChapter = data.chapters[0];
  const needsSubscription =
    data.isFree === false && entitlementQuery.data?.isActive !== true;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <GradientPlaceholder variant="primary" style={{ height: 280, paddingTop: insets.top + spacing.xl }}>
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>{data.title}</Text>
          {data.subtitle ? <Text style={styles.heroSubtitle}>{data.subtitle}</Text> : null}
          <View style={styles.tagRow}>
            {data.tags.map((tag) => (
              <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
            ))}
          </View>
        </View>
      </GradientPlaceholder>

      {/* 站点时间轴 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>旅程站点</Text>
        {data.chapters.map((ch) => (
          <View key={ch.id} style={styles.chapterCard}>
            <Text style={styles.chapterIndex}>第{ch.index}章</Text>
            <Text style={styles.chapterTitle}>{ch.title}</Text>
            {ch.subtitle ? <Text style={styles.chapterSubtitle}>{ch.subtitle}</Text> : null}
            {/* 站点列表 */}
            {ch.stops.map((stop, i) => (
              <View key={i} style={styles.stopRow}>
                <View style={styles.stopDot} />
                <Text style={styles.stopTime}>{formatStopTime(stop.timeSec)}</Text>
                <View style={styles.stopText}>
                  <Text style={styles.stopTitle}>{stop.title}</Text>
                  {stop.subtitle ? <Text style={styles.stopSubtitle}>{stop.subtitle}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* 音景构成 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>音景构成</Text>
        <View style={styles.mixRow}>
          <View style={styles.mixBar}><View style={[styles.mixFill, { width: '40%', backgroundColor: colors.vio }]} /></View>
          <Text style={styles.mixLabel}>旁白 40%</Text>
        </View>
        <View style={styles.mixRow}>
          <View style={styles.mixBar}><View style={[styles.mixFill, { width: '35%', backgroundColor: colors.green }]} /></View>
          <Text style={styles.mixLabel}>环境音 35%</Text>
        </View>
        <View style={styles.mixRow}>
          <View style={styles.mixBar}><View style={[styles.mixFill, { width: '25%', backgroundColor: colors.gold }]} /></View>
          <Text style={styles.mixLabel}>配乐 25%</Text>
        </View>
      </View>

      {/* 吸底 CTA */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Pressable
          disabled={!firstChapter || starting}
          onPress={() => (needsSubscription ? openPaywall() : void handleStart())}
        >
          {({ pressed }) => (
            <LinearGradient colors={gradients.gold} style={[styles.ctaButton, pressed && { opacity: 0.8 }]}>
              <Text style={styles.ctaText}>
                {starting ? '正在准备…' : needsSubscription ? '订阅后开启这段旅程' : '开始这段旅程'}
              </Text>
            </LinearGradient>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );

  function openPaywall(): void {
    if (!id || !firstChapter) return;
    router.push({
      pathname: '/paywall',
      params: { journeyId: id, chapterId: firstChapter.id },
    });
  }

  async function handleStart(): Promise<void> {
    if (!id || !firstChapter) {
      return;
    }
    setStarting(true);
    try {
      await startChapter(id, firstChapter.id);
      router.push('/player');
    } catch (err) {
      if (isSubscriptionError(err)) {
        // 权益过期等竞态：直接打开订阅引导页，不弹通用错误
        openPaywall();
        return;
      }
      const msg = err instanceof Error ? err.message : '播放准备失败，请稍后再试';
      Alert.alert('稍后再试', msg);
    } finally {
      setStarting(false);
    }
  }
}

function formatStopTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.pBg },
  center: { flex: 1, backgroundColor: colors.pBg, justifyContent: 'center', alignItems: 'center' },
  hintText: { color: colors.tx3, fontSize: fontSize.body },
  errorText: { color: colors.gold, fontSize: fontSize.body, marginBottom: spacing.md },
  linkText: { color: colors.vio, fontSize: fontSize.body },
  heroContent: { padding: spacing.base },
  heroTitle: { color: colors.tx, fontSize: fontSize.display, fontWeight: '700', lineHeight: lineHeight.tight },
  heroSubtitle: { color: colors.tx2, fontSize: fontSize.bodyLg, marginTop: spacing.xs },
  tagRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  tag: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagText: { color: '#fff', fontSize: fontSize.caption },
  section: { paddingHorizontal: spacing.base, marginTop: spacing.xl },
  sectionTitle: { color: colors.tx, fontSize: fontSize.titleLg, fontWeight: '600', marginBottom: spacing.md },
  chapterCard: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginBottom: spacing.md },
  chapterIndex: { color: colors.gold, fontSize: fontSize.caption, fontWeight: '600' },
  chapterTitle: { color: colors.tx, fontSize: fontSize.titleLg, fontWeight: '600', marginTop: spacing.xs },
  chapterSubtitle: { color: colors.tx2, fontSize: fontSize.body, marginTop: 2 },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.md, gap: spacing.sm },
  stopDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.vio, marginTop: 4 },
  stopTime: { color: colors.tx3, fontSize: fontSize.caption, fontVariant: ['tabular-nums'], width: 44 },
  stopText: { flex: 1 },
  stopTitle: { color: colors.tx, fontSize: fontSize.body },
  stopSubtitle: { color: colors.tx2, fontSize: fontSize.caption, marginTop: 2 },
  mixRow: { marginBottom: spacing.md },
  mixBar: { height: 8, backgroundColor: colors.card2, borderRadius: radius.pill, overflow: 'hidden' },
  mixFill: { height: '100%', borderRadius: radius.pill },
  mixLabel: { color: colors.tx2, fontSize: fontSize.caption, marginTop: spacing.xs },
  ctaBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bg2, paddingTop: spacing.md, paddingHorizontal: spacing.base, borderTopColor: colors.line, borderTopWidth: 1 },
  ctaButton: { height: sizes.buttonHeight, borderRadius: radius.button, justifyContent: 'center', alignItems: 'center' },
  ctaText: { color: '#1A1410', fontSize: fontSize.bodyLg, fontWeight: '700' },
});
