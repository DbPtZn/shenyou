import { ENTITLEMENT_ID } from "@shenyou/shared";

/**
 * RevenueCat 事件类型常量与状态机映射。
 * 参考：RevenueCat Webhook Event Types（INITIAL_PURCHASE … SUBSCRIPTION_PAUSED）。
 */

export const BILLING_EVENTS = {
  InitialPurchase: "INITIAL_PURCHASE",
  Renewal: "RENEWAL",
  Cancellation: "CANCELLATION",
  Uncancellation: "UNCANCELLATION",
  Expiration: "EXPIRATION",
  ProductChange: "PRODUCT_CHANGE",
  BillingIssue: "BILLING_ISSUE",
  Refund: "REFUND",
  /** RC 非 V2 中退款/撤销也可能使用此类型 */
  Revocation: "SUBSCRIPTION_REVOKED",
  SubscriberAlias: "SUBSCRIBER_ALIAS",
  Transfer: "TRANSFER",
  Paused: "SUBSCRIPTION_PAUSED",
  Test: "TEST",
} as const;

/** 状态机动作 */
export type EntitlementAction = "grant" | "keep-canceled" | "revoke" | "ignore";

/** 事件类型 → 状态机动作 */
export const EVENT_ACTION: Readonly<Record<string, EntitlementAction>> = {
  [BILLING_EVENTS.InitialPurchase]: "grant",
  [BILLING_EVENTS.Renewal]: "grant",
  [BILLING_EVENTS.Uncancellation]: "grant",
  [BILLING_EVENTS.ProductChange]: "grant",
  // 取消自动续费：到期前保留权益，仅标记 willRenew=false
  [BILLING_EVENTS.Cancellation]: "keep-canceled",
  [BILLING_EVENTS.Expiration]: "revoke",
  [BILLING_EVENTS.Refund]: "revoke",
  [BILLING_EVENTS.Revocation]: "revoke",
  // 宽限/身份类事件：不改变权益
  [BILLING_EVENTS.BillingIssue]: "ignore",
  [BILLING_EVENTS.SubscriberAlias]: "ignore",
  [BILLING_EVENTS.Transfer]: "ignore",
  [BILLING_EVENTS.Paused]: "ignore",
  [BILLING_EVENTS.Test]: "ignore",
};

/** 本服务关心的 entitlement id */
export const PREMIUM_ENTITLEMENT = ENTITLEMENT_ID;

/** 沙盒模拟使用的产品 ID（与 RC dashboard 未来配置的产品命名保持一致） */
export const SANDBOX_PRODUCTS = {
  monthly: "shenyou_premium_monthly",
  yearly: "shenyou_premium_yearly",
} as const;
