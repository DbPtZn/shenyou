import { api } from './client';

/** 权益信息（与 server EntitlementDto 对齐） */
export interface Entitlement {
  isActive: boolean;
  status: 'active' | 'expired';
  subscriptionStatus: string;
  environment: 'SANDBOX' | 'PRODUCTION' | null;
  store: 'app_store' | 'play_store' | 'stripe' | 'unknown' | null;
  productId: string | null;
  periodType: 'NORMAL' | 'TRIAL' | 'INTRO' | 'PROMOTIONAL' | null;
  willRenew: boolean;
  expirationAt: string | null;
}

/** 沙盒可模拟事件 */
export type SandboxEventType = 'INITIAL_PURCHASE' | 'CANCELLATION' | 'EXPIRATION';
export type SandboxPlan = 'monthly' | 'yearly';

/** 查询当前权益 */
export function getEntitlement(): Promise<Entitlement> {
  return api.get<Entitlement>('/billing/entitlement');
}

/** 购买/恢复后主动对账（secret key 未配置时 503，调用方降级处理） */
export function syncRevenueCat(): Promise<Entitlement> {
  return api.post<Entitlement>('/billing/revenuecat/sync');
}

/** 沙盒模拟（本地联调；生产 404） */
export function sandboxSimulate(params: {
  eventType: SandboxEventType;
  plan?: SandboxPlan;
  expiresInSec?: number;
}): Promise<Entitlement> {
  return api.post<Entitlement>('/billing/sandbox/simulate', params);
}
