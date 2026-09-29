import { Link, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getEntitlement, sandboxSimulate } from '@/api/billing';
import { useAuthStore } from '@/state/auth-store';
import { colors, fontSize, radius, spacing, gradients } from '@/theme/tokens';

const MENU_ITEMS: {
  icon: 'bar-chart' | 'heart' | 'time' | 'download' | 'color-wand' | 'settings';
  label: string;
  href: Href;
}[] = [
  { icon: 'bar-chart' as const, label: '睡眠报告', href: '/report' },
  { icon: 'heart' as const, label: '我的收藏', href: '/(tabs)/mine' },
  { icon: 'time' as const, label: '播放历史', href: '/(tabs)/mine' },
  { icon: 'download' as const, label: '离线下载', href: '/(tabs)/mine' },
  { icon: 'color-wand' as const, label: '我的定制', href: '/(tabs)/studio' },
  { icon: 'settings' as const, label: '设置', href: '/(tabs)/mine' },
];

const SUBSCRIPTION_LABELS: Record<string, string> = {
  active: '会员版',
  trial: '试用中',
  expired: '已过期',
  canceled: '免费版',
  free: '免费版',
};

export default function MineScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const entitlementQuery = useQuery({
    queryKey: ['entitlement'],
    queryFn: getEntitlement,
  });
  const entitlement = entitlementQuery.data;
  const isMember = entitlement?.isActive ?? false;
  const badgeLabel = isMember
    ? SUBSCRIPTION_LABELS[entitlement?.subscriptionStatus ?? 'active'] ?? '会员版'
    : entitlement?.status === 'expired'
      ? '已过期'
      : '免费版';

  const handleLogout = () => {
    logout().then(() => router.replace('/login'));
  };

  /** 点击会员卡片：未会员去订阅；会员告知到期时间与管理方式 */
  const handleMemberCard = () => {
    if (isMember) {
      const expireText = entitlement?.expirationAt
        ? `到期时间 ${formatDate(entitlement.expirationAt)}`
        : '';
      const renewText = entitlement?.willRenew
        ? '如需取消，可在系统账号的订阅管理中操作'
        : '已取消续费，到期前仍可使用全部会员内容';
      Alert.alert('会员详情', [expireText, renewText].filter(Boolean).join('\n'));
    } else {
      router.push('/paywall');
    }
  };

  /** DEV：模拟订阅到期（mock 提供者，驱动与 webhook 相同的状态机） */
  const handleDevExpire = async () => {
    try {
      await sandboxSimulate({ eventType: 'EXPIRATION' });
      await queryClient.invalidateQueries({ queryKey: ['entitlement'] });
    } catch (error) {
      Alert.alert('操作失败', error instanceof Error ? error.message : '请稍后再试');
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 会员卡片（可点击：了解会员 / 查看详情） */}
      <View style={styles.memberCardWrap}>
        <Pressable onPress={handleMemberCard}>
          <LinearGradient colors={gradients.primary} style={styles.memberCard}>
            <View style={styles.memberInfo}>
              <Text style={styles.nickname}>{user?.nickname ?? '神游用户'}</Text>
              <Text style={styles.account}>
                {isMember
                  ? entitlement?.expirationAt
                    ? `到期 ${formatDate(entitlement.expirationAt)}`
                    : '会员生效中'
                  : '了解神游会员'}
              </Text>
            </View>
            <View style={styles.cardRight}>
              <View style={styles.subscriptionBadge}>
                <Text style={styles.subscriptionText}>{badgeLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>

      {__DEV__ && isMember ? (
        <Pressable style={styles.devUpgrade} onPress={() => void handleDevExpire()}>
          <Ionicons name="time-outline" size={16} color={colors.gold} />
          <Text style={styles.devUpgradeText}>模拟订阅到期（测试）</Text>
        </Pressable>
      ) : null}

      {/* 三项统计 */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>128</Text>
          <Text style={styles.statLabel}>伴眠分钟</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>12</Text>
          <Text style={styles.statLabel}>完成旅程</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>76</Text>
          <Text style={styles.statLabel}>睡眠评分</Text>
        </View>
      </View>

      {/* 菜单 */}
      <View style={styles.menuSection}>
        {MENU_ITEMS.map((item) => (
          <Link key={item.label} href={item.href} asChild>
            <Pressable style={styles.menuItem}>
              <Ionicons name={item.icon} size={22} color={colors.tx2} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.tx3} />
            </Pressable>
          </Link>
        ))}
      </View>

      {/* 法律与关于 */}
      <View style={styles.menuSection}>
        <Pressable style={styles.menuItem} onPress={() => router.push('/legal/privacy')}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.tx2} />
          <Text style={styles.menuLabel}>隐私政策</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.tx3} />
        </Pressable>
        <Pressable style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => router.push('/legal/terms')}>
          <Ionicons name="document-text-outline" size={22} color={colors.tx2} />
          <Text style={styles.menuLabel}>用户协议</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.tx3} />
        </Pressable>
      </View>

      {/* 退出登录 */}
      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </Pressable>
    </ScrollView>
  );
}

/** ISO 时间 → YYYY-MM-DD 展示 */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  memberCardWrap: { paddingHorizontal: spacing.base, marginTop: spacing.lg },
  memberCard: { borderRadius: radius.card, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberInfo: { flex: 1 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nickname: { color: '#fff', fontSize: fontSize.titleLg, fontWeight: '700' },
  account: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.body, marginTop: 2 },
  subscriptionBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  subscriptionText: { color: '#fff', fontSize: fontSize.caption },
  devUpgrade: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.sm, marginHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: radius.button, borderWidth: 1, borderColor: 'rgba(240,206,142,0.4)', backgroundColor: 'rgba(240,206,142,0.08)' },
  devUpgradeText: { color: colors.gold, fontSize: fontSize.caption },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginHorizontal: spacing.base, marginVertical: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.card, borderRadius: radius.card },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.gold, fontSize: fontSize.titleLg, fontWeight: '700' },
  statLabel: { color: colors.tx2, fontSize: fontSize.caption, marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: colors.line },
  menuSection: { marginHorizontal: spacing.base, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.base, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
  menuLabel: { flex: 1, color: colors.tx, fontSize: fontSize.bodyLg, marginLeft: spacing.md },
  logoutButton: { marginHorizontal: spacing.base, marginTop: spacing.xxl, paddingVertical: spacing.base, alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.button },
  logoutText: { color: colors.pink, fontSize: fontSize.bodyLg },
});
