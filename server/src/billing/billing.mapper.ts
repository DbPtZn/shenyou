import { type BillingStore } from "@shenyou/shared";
import { BILLING_EVENTS } from "./billing.constants";
import type {
  NormalizedBillingEvent,
  RevenueCatWebhookPayload,
} from "./billing.types";

/**
 * 将 RevenueCat webhook 原始 payload 归一化为内部事件。
 * webhook 与沙盒模拟两条入口共用同一结构，确保状态机只有一份实现。
 */
export function normalizeWebhookEvent(raw: RevenueCatWebhookPayload): NormalizedBillingEvent {
  const e = raw.event;
  return {
    eventId: e.id,
    eventType: e.type,
    appUserId: e.app_user_id,
    environment: e.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX",
    store: normalizeStore(e.store),
    productId: e.product_id ?? null,
    periodType: normalizePeriodType(e.period_type),
    entitlementIds: e.entitlement_ids ?? [],
    // CANCELLATION 事件本身意味着不再续费；其余事件默认续费
    willRenew: e.type !== BILLING_EVENTS.Cancellation,
    expirationAt:
      typeof e.expiration_at_ms === "number" ? new Date(e.expiration_at_ms) : null,
    originalTransactionId: e.original_transaction_id ?? e.transaction_id ?? null,
  };
}

function normalizeStore(store: string | undefined): BillingStore {
  switch (store) {
    case "APP_STORE":
      return "app_store";
    case "PLAY_STORE":
      return "play_store";
    case "STRIPE":
      return "stripe";
    default:
      return "unknown";
  }
}

function normalizePeriodType(period: string | undefined): NormalizedBillingEvent["periodType"] {
  if (period === "NORMAL" || period === "TRIAL" || period === "INTRO" || period === "PROMOTIONAL") {
    return period;
  }
  return null;
}
