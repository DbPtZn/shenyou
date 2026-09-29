/**
 * RevenueCat webhook 事件类型（按官方 event-types-and-fields 文档）。
 * 仅声明本服务消费的字段，未声明字段在解析时被忽略（不做全量严格校验，保持前向兼容）。
 */

/** webhook 外层：{ api_version, event } */
export interface RevenueCatWebhookPayload {
  api_version?: string | undefined;
  event: RevenueCatEvent;
}

/** 单个事件（字段均为官方可能下发项，可选字段按 RC 文档标注） */
export interface RevenueCatEvent {
  id: string;
  type: string;
  /** RC 中的用户标识；本系统登录后 logIn(User.id)，故等于本系统 userId */
  app_user_id: string;
  aliases?: string[];
  product_id: string;
  /** NORMAL / TRIAL / INTRO / PROMOTIONAL */
  period_type?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  /** APP_STORE / PLAY_STORE / STRIPE / ... */
  store?: string;
  /** SANDBOX / PRODUCTION */
  environment?: string;
  entitlement_ids?: string[];
  transaction_id?: string;
  original_transaction_id?: string;
  /** RC v2 字段名 */
  original_app_user_id?: string;
}

/** 归一化计费事件：webhook 与沙盒模拟共同的内部处理输入 */
export interface NormalizedBillingEvent {
  eventId: string;
  eventType: string;
  appUserId: string;
  environment: "SANDBOX" | "PRODUCTION";
  store: string;
  productId: string | null;
  periodType: string | null;
  entitlementIds: string[];
  willRenew: boolean;
  expirationAt: Date | null;
  originalTransactionId: string | null;
}

/** applyEvent 处理结果 */
export interface ApplyEventResult {
  /** 事件是否重复（重复事件不再驱动状态机） */
  duplicated: boolean;
  /** 处理后用户的订阅状态 */
  subscriptionStatus: string;
}
