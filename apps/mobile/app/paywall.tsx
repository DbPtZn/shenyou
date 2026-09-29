import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getEntitlement } from '@/api/billing';
import { startChapter } from '@/audio/player.service';
import { getPurchases } from '@/purchases/purchases.factory';
import type { PlanDisplayInfo, PurchasePlan } from '@/purchases/purchases.types';
import {
  colors,
  fontSize,
  lineHeight,
  radius,
  spacing,
} from '@/theme/tokens';

/** 会员权益清单（App Store 3.1.2：决策点必须说明付费获得什么） */
const BENEFITS: string[] = [
  '全部沉浸旅程，随时畅听',
  '默认 / 放松两种混音版本自由切换',
  '新旅程上线，会员优先收听',
  '可随时取消，到期前权益不受影响',
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { journeyId, chapterId } = useLocalSearchParams<{
    journeyId?: string;
    chapterId?: string;
  }>();

  const entitlementQuery = useQuery({
    queryKey: ['entitlement'],
    queryFn: getEntitlement,
  });
  const plansQuery = useQuery({
    queryKey: ['purchase-plans'],
    queryFn: () => getPurchases().getPlans(),
  });

  const plans = plansQuery.data ?? [];
  const isMember = entitlementQuery.data?.isActive ?? false;

  const continueIntoJourney = async (): Promise<void> => {
    if (journeyId && chapterId) {
      await startChapter(journeyId, chapterId);
      router.dismissAll();
      router.navigate('/player');
    } else {
      router.dismiss();
    }
  };

  const handlePurchase = async (plan: PurchasePlan): Promise<void> => {
    try {
      const result = await getPurchases().purchase(plan);
      if (result.userCancelled) return;
      await queryClient.invalidateQueries({ queryKey: ['entitlement'] });
      await continueIntoJourney();
    } catch (error) {
      Alert.alert(
        '暂时没能完成',
        error instanceof Error ? error.message : '请稍后再试，或先恢复购买',
      );
    }
  };

  const handleRestore = async (): Promise<void> => {
    try {
      const result = await getPurchases().restore();
      if (result.isActive) {
        await queryClient.invalidateQueries({ queryKey: ['entitlement'] });
        await continueIntoJourney();
      } else {
        Alert.alert('没有找到可恢复的购买', '如果你确认订阅过，请检查登录的账号，或联系客服协助。');
      }
    } catch (error) {
      Alert.alert(
        '恢复未完成',
        error instanceof Error ? error.message : '网络似乎不太稳，请稍后再试',
      );
    }
  };

  const handleLink = (route: '/legal/terms' | '/legal/privacy'): void => {
    router.push(route);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xxl,
          paddingHorizontal: spacing.base,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* 关闭 */}
        <Pressable
          style={styles.closeButton}
          onPress={() => router.dismiss()}
          hitSlop={12}
        >
          <Ionicons name="close" size={22} color={colors.tx2} />
        </Pressable>

        {/* 标题区 */}
        <Text style={styles.eyebrow}>神游会员</Text>
        <Text style={styles.title}>让更多旅程，{'\n'}陪你慢慢入梦</Text>
        <Text style={styles.subtitle}>每一个场景，都为今夜的你准备着。</Text>

        {/* 权益清单 */}
        <View style={styles.benefits}>
          {BENEFITS.map((item) => (
            <View key={item} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.gold} />
              <Text style={styles.benefitText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* 已是会员 */}
        {isMember ? (
          <View style={styles.memberBox}>
            <Ionicons name="moon" size={20} color={colors.gold} />
            <Text style={styles.memberText}>你已是会员，愿今夜好梦</Text>
          </View>
        ) : (
          <>
            {/* 方案卡 */}
            {plansQuery.isLoading ? (
              <ActivityIndicator color={colors.tx3} style={styles.plansLoading} />
            ) : (
              <PlanSelector
                plans={plans}
                onSelect={(plan) => void handlePurchase(plan)}
              />
            )}

            {/* 续费说明 */}
            <Text style={styles.legalText}>
              订阅到期前 24 小时自动续费，可随时在系统账号设置中取消，
              取消后到期前仍可使用。
            </Text>

            {/* 协议链接 */}
            <View style={styles.linksRow}>
              <Pressable onPress={() => handleLink('/legal/terms')}>
                <Text style={styles.linkText}>用户协议</Text>
              </Pressable>
              <Text style={styles.linkDot}>·</Text>
              <Pressable onPress={() => handleLink('/legal/privacy')}>
                <Text style={styles.linkText}>隐私政策</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {/* 恢复购买（App Store 审核硬要求；会员态下隐藏） */}
      {!isMember ? (
        <Pressable
          style={[styles.restoreBar, { paddingBottom: insets.bottom + spacing.sm }]}
          onPress={() => void handleRestore()}
        >
          <Text style={styles.restoreText}>恢复购买</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 方案选择器：点击卡片即购买（选中/支付态在卡片内部呈现） */
function PlanSelector({
  plans,
  onSelect,
}: {
  plans: PlanDisplayInfo[];
  onSelect: (plan: PurchasePlan) => void;
}) {
  return (
    <View style={styles.planList}>
      {plans.map((plan) => (
        <Pressable
          key={plan.plan}
          style={({ pressed }) => [
            styles.planCard,
            plan.plan === 'yearly' && styles.planCardPopular,
            pressed && styles.planCardPressed,
          ]}
          onPress={() => onSelect(plan.plan)}
        >
          <View style={styles.planMain}>
            <Text style={styles.planName}>
              {plan.plan === 'monthly' ? '月度会员' : '年度会员'}
            </Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceText}>{plan.priceText}</Text>
              <Text style={styles.periodText}>{plan.periodText}</Text>
            </View>
            {plan.perWeekText ? <Text style={styles.perWeekText}>{plan.perWeekText}</Text> : null}
          </View>
          {plan.savingsText ? (
            <View style={styles.savingsTag}>
              <Text style={styles.savingsText}>{plan.savingsText}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pBg },
  scroll: { flex: 1 },
  closeButton: { position: 'absolute', top: spacing.md, right: spacing.base, zIndex: 1, padding: spacing.xs },
  eyebrow: { color: colors.gold, fontSize: fontSize.caption, letterSpacing: 2, marginTop: spacing.xl },
  title: {
    color: colors.tx,
    fontSize: fontSize.display,
    fontWeight: '700',
    lineHeight: lineHeight.tight,
    marginTop: spacing.sm,
  },
  subtitle: { color: colors.tx2, fontSize: fontSize.bodyLg, marginTop: spacing.sm },
  benefits: { marginTop: spacing.xl, gap: spacing.md },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benefitText: { color: colors.tx2, fontSize: fontSize.bodyLg, flex: 1 },
  memberBox: {
    marginTop: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(240,206,142,0.35)',
    paddingVertical: spacing.lg,
  },
  memberText: { color: colors.gold, fontSize: fontSize.bodyLg },
  plansLoading: { marginTop: spacing.xxl },
  planList: { marginTop: spacing.xl, gap: spacing.base },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
  },
  planCardPopular: { borderColor: 'rgba(240,206,142,0.5)' },
  planCardPressed: { backgroundColor: colors.card2 },
  planMain: { flex: 1 },
  planName: { color: colors.tx, fontSize: fontSize.bodyLg, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
  priceText: { color: colors.tx, fontSize: fontSize.titleLg, fontWeight: '700' },
  periodText: { color: colors.tx3, fontSize: fontSize.body, marginLeft: 2 },
  perWeekText: { color: colors.tx3, fontSize: fontSize.caption, marginTop: 2 },
  savingsTag: {
    backgroundColor: 'rgba(240,206,142,0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  savingsText: { color: colors.gold, fontSize: fontSize.caption },
  legalText: {
    color: colors.tx3,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.relaxed,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  linksRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  linkText: { color: colors.tx2, fontSize: fontSize.caption },
  linkDot: { color: colors.tx3, fontSize: fontSize.caption },
  restoreBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: spacing.sm,
    backgroundColor: 'transparent',
  },
  restoreText: { color: colors.tx2, fontSize: fontSize.body, paddingVertical: spacing.sm },
});
