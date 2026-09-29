import { MockPurchases } from './providers/mock.purchases';
import { RevenueCatPurchases } from './providers/revenuecat.purchases';
import type { PurchasesService } from './purchases.types';

/**
 * 购买服务工厂：按 EXPO_PUBLIC_BILLING_PROVIDER 选择。
 * - mock（默认）：本地模拟，Expo Go 可用；
 * - revenuecat：真实商店购买，需 development build + 平台 API key。
 *
 * 模块级单例（同全局播放器，避免重复 configure / 重复监听）。
 */
let instance: PurchasesService | null = null;

export function getPurchases(): PurchasesService {
  if (instance) return instance;

  const provider = process.env.EXPO_PUBLIC_BILLING_PROVIDER ?? 'mock';
  instance = provider === 'revenuecat' ? new RevenueCatPurchases() : new MockPurchases();
  return instance;
}
