import { getEntitlement, sandboxSimulate } from '@/api/billing';
import type {
  EntitlementChangeListener,
  PlanDisplayInfo,
  PurchasePlan,
  PurchaseResult,
  PurchasesService,
  RestoreResult,
} from '../purchases.types';

/**
 * 本地开发购买适配器（Expo Go 可用）：
 * 通过服务端 /billing/sandbox/simulate 驱动与真实 webhook 完全相同的状态机，
 * 使「购买 → 解锁 → 恢复 → 过期再拦截」的验收闭环无需商店账号即可执行。
 */
export class MockPurchases implements PurchasesService {
  private readonly listeners: EntitlementChangeListener[] = [];

  configure(): void {
    // 本地模拟无需配置
  }

  async login(): Promise<void> {
    // 身份由 JWT 保证，无需额外绑定
  }

  async logout(): Promise<void> {
    // 权益随服务端会话隔离
  }

  async getPlans(): Promise<PlanDisplayInfo[]> {
    // 沙盒模拟价格（仅本地联调展示；真实模式价格由商店返回）
    return [
      { plan: 'monthly', priceText: '¥25', periodText: '/月' },
      {
        plan: 'yearly',
        priceText: '¥168',
        periodText: '/年',
        perWeekText: '约 ¥3.2/周',
        savingsText: '节省 44%',
      },
    ];
  }

  async purchase(plan: PurchasePlan): Promise<PurchaseResult> {
    const ent = await sandboxSimulate({ eventType: 'INITIAL_PURCHASE', plan });
    this.notify(ent.isActive);
    return { isActive: ent.isActive, userCancelled: false };
  }

  async restore(): Promise<RestoreResult> {
    const ent = await getEntitlement();
    return { isActive: ent.isActive };
  }

  addEntitlementChangeListener(listener: EntitlementChangeListener): void {
    this.listeners.push(listener);
  }

  private notify(isActive: boolean): void {
    for (const listener of this.listeners) {
      listener(isActive);
    }
  }
}
