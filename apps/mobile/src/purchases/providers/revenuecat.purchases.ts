import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';
import { syncRevenueCat } from '@/api/billing';
import type {
  EntitlementChangeListener,
  PlanDisplayInfo,
  PurchasePlan,
  PurchaseResult,
  PurchasesService,
  RestoreResult,
} from '../purchases.types';

/** 与 packages/shared ENTITLEMENT_ID 保持一致（mobile 不直接依赖 shared） */
const PREMIUM_ENTITLEMENT = 'premium';

/**
 * RevenueCat 真实购买适配器（iOS App Store + Google Play 统一管理）。
 * - configure：平台公共 SDK key（EXPO_PUBLIC_REVENUECAT_*_API_KEY）；
 * - login/logout：app_user_id 与本系统 userId 绑定；
 * - purchase：当前 offering 中按 packageType 取月度/年度包购买；
 * - restore：恢复购买（App Store 审核硬要求）；
 * - 购买/恢复后触发服务端对账（best-effort，失败由 webhook 兜底）。
 */
export class RevenueCatPurchases implements PurchasesService {
  private configured = false;

  configure(): void {
    if (this.configured) return;
    const apiKey =
      Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
    if (!apiKey) {
      throw new Error('未配置 RevenueCat 公共 API Key');
    }
    Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    this.configured = true;
  }

  async login(appUserId: string): Promise<void> {
    this.configure();
    await Purchases.logIn(appUserId);
  }

  async logout(): Promise<void> {
    if (!this.configured) return;
    await Purchases.logOut();
  }

  async getPlans(): Promise<PlanDisplayInfo[]> {
    this.configure();
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    const monthly = packages.find(
      (pkg) => pkg.packageType === Purchases.PACKAGE_TYPE.MONTHLY,
    );
    const annual = packages.find(
      (pkg) => pkg.packageType === Purchases.PACKAGE_TYPE.ANNUAL,
    );

    const plans: PlanDisplayInfo[] = [];
    if (monthly) {
      plans.push({ plan: 'monthly', priceText: monthly.product.priceString, periodText: '/月' });
    }
    if (annual) {
      const info: PlanDisplayInfo = {
        plan: 'yearly',
        priceText: annual.product.priceString,
        periodText: '/年',
      };
      if (monthly && monthly.product.price > 0) {
        const monthlyCost = monthly.product.price;
        const yearlyCost = annual.product.price;
        const perWeek = formatPrice(annual.product.currencyCode, yearlyCost / 52);
        if (perWeek) info.perWeekText = `约 ${perWeek}/周`;
        const savings = 1 - yearlyCost / (monthlyCost * 12);
        if (savings > 0) info.savingsText = `节省 ${Math.round(savings * 100)}%`;
      }
      plans.push(info);
    }
    return plans;
  }

  async purchase(plan: PurchasePlan): Promise<PurchaseResult> {
    this.configure();

    const pkg = await this.findPackage(plan);
    if (!pkg) {
      throw new Error('订阅商品暂不可用，请稍后再试');
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const isActive = hasPremium(customerInfo.entitlements);
      await this.reconcileServer();
      return { isActive, userCancelled: false };
    } catch (error) {
      if (isUserCancelled(error)) {
        return { isActive: false, userCancelled: true };
      }
      throw error instanceof Error ? error : new Error('购买失败，请稍后再试');
    }
  }

  async restore(): Promise<RestoreResult> {
    this.configure();
    const customerInfo = await Purchases.restorePurchases();
    const isActive = hasPremium(customerInfo.entitlements);
    await this.reconcileServer();
    return { isActive };
  }

  addEntitlementChangeListener(listener: EntitlementChangeListener): void {
    this.configure();
    Purchases.addCustomerInfoUpdateListener((info) => {
      listener(hasPremium(info.entitlements));
    });
  }

  /** 从当前 offering 中按方案找包（月度/年度） */
  private async findPackage(plan: PurchasePlan) {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    const wantedType =
      plan === 'monthly'
        ? Purchases.PACKAGE_TYPE.MONTHLY
        : Purchases.PACKAGE_TYPE.ANNUAL;
    return packages.find((pkg) => pkg.packageType === wantedType);
  }

  /** 通知服务端按 REST 对账；未配置 secret key（503）时静默，webhook 会最终一致 */
  private async reconcileServer(): Promise<void> {
    try {
      await syncRevenueCat();
    } catch {
      // best-effort
    }
  }
}

/** CustomerInfo.entitlements 中 premium 是否处于 active */
function hasPremium(entitlements: {
  active: Record<string, unknown>;
}): boolean {
  return entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
}

/** SDK 错误是否为用户取消 */
function isUserCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: string; userCancelled?: boolean | null };
  return (
    e.userCancelled === true ||
    e.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

/** 按币种格式化单价（Intl 不可用时返回 null，由调用方省略该文案） */
function formatPrice(currencyCode: string, value: number): string | null {
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: value < 10 ? 1 : 0,
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return null;
  }
}
