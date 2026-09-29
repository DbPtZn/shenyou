import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontSize, radius, spacing, gradients } from '@/theme/tokens';

const WEEK_DATA = [62, 78, 45, 90, 55, 72, 85];
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MAX_MIN = 100;

export default function ReportScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>睡眠报告</Text>
      <Text style={styles.pageSubtitle}>本周的入睡旅程记录</Text>

      {/* 柱状图 */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>本周伴眠时长</Text>
        <View style={styles.chartBody}>
          {WEEK_DATA.map((min, i) => (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${(min / MAX_MIN) * 100}%` }]} />
              </View>
              <Text style={styles.barLabel}>{WEEK_LABELS[i]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 统计 */}
      <View style={styles.statsSection}>
        <StatCard icon="moon" label="平均入睡用时" value="18分钟" />
        <StatCard icon="eye" label="夜醒次数" value="1.3次" />
        <StatCard icon="musical-notes" label="伴眠总时长" value="8.2小时" />
      </View>

      {/* 最常伴眠场景 */}
      <View style={styles.favoriteCard}>
        <Text style={styles.favoriteLabel}>最常伴眠场景</Text>
        <LinearGradient colors={gradients.gold} style={styles.favoriteBadge}>
          <Text style={styles.favoriteText}>雨夜京都小巷</Text>
        </LinearGradient>
        <Text style={styles.favoriteCount}>本周听了 5 次</Text>
      </View>
    </ScrollView>
  );
}

function StatCard({ icon, label, value }: { icon: 'moon' | 'eye' | 'musical-notes'; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={24} color={colors.vio} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.pBg },
  pageTitle: { color: colors.tx, fontSize: fontSize.hero, fontWeight: '700', paddingHorizontal: spacing.base, marginTop: spacing.lg },
  pageSubtitle: { color: colors.tx2, fontSize: fontSize.body, paddingHorizontal: spacing.base, marginTop: spacing.xs },
  chartCard: { marginHorizontal: spacing.base, marginTop: spacing.xl, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: spacing.lg },
  chartTitle: { color: colors.tx, fontSize: fontSize.bodyLg, fontWeight: '600', marginBottom: spacing.lg },
  chartBody: { flexDirection: 'row', justifyContent: 'space-between', height: 160, alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barTrack: { width: 16, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.vio, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { color: colors.tx3, fontSize: fontSize.caption },
  statsSection: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.base, marginTop: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  statValue: { color: colors.gold, fontSize: fontSize.titleLg, fontWeight: '700' },
  statLabel: { color: colors.tx2, fontSize: fontSize.caption },
  favoriteCard: { marginHorizontal: spacing.base, marginTop: spacing.lg, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, alignItems: 'center' },
  favoriteLabel: { color: colors.tx2, fontSize: fontSize.body, marginBottom: spacing.md },
  favoriteBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  favoriteText: { color: '#1A1410', fontSize: fontSize.bodyLg, fontWeight: '700' },
  favoriteCount: { color: colors.tx3, fontSize: fontSize.caption, marginTop: spacing.sm },
});
